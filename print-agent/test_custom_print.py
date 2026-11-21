import json
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
import agent
import print_agent


ROOT = Path(__file__).parent
PROFILE = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))


class CustomPrintTests(unittest.TestCase):
    def test_physical_mapping_preserves_pixels_and_dimensions(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "sheet.png"
            img = Image.new("RGB", (1181, 1748), "white")
            img.putpixel((300, 500), (255, 0, 0))
            img.save(source)
            page = print_agent.build_custom_sheet(source, PROFILE)
            x, y = print_agent.custom_paper_origin(PROFILE)
            self.assertAlmostEqual(x, 2.835)
            self.assertAlmostEqual(y, 5.25)
            self.assertEqual(page.size, (print_agent.mm2px(105.67), print_agent.mm2px(158.5)))
            self.assertEqual(page.getpixel((print_agent.mm2px(x) + 300, print_agent.mm2px(y) + 500)), (255, 0, 0))

    def test_rejects_small_printable_area_and_wrong_raster(self):
        with self.assertRaises(ValueError):
            print_agent.custom_paper_origin(print_agent.DEFAULT_CONFIG)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "bad.png"
            Image.new("RGB", (1000, 1480)).save(source)
            with self.assertRaises(ValueError):
                print_agent.build_custom_sheet(source, PROFILE)

    def test_capability_requires_physical_profile_and_unscaled_postcard(self):
        cfg = {"lp_options": ["-o", "PageSize=Postcard", "-o", "print-scaling=none"]}
        self.assertIn(agent.CUSTOM_LAYOUT_MODE, agent.supported_layout_modes(cfg))
        self.assertNotIn(agent.CUSTOM_LAYOUT_MODE, agent.supported_layout_modes({"lp_options": ["-o", "media=A4"]}))

    def test_remaining_copies_only_and_acknowledged_progress(self):
        job = {"jobId": 3, "copies": 4, "completedCopies": 2, "attempt": 2}
        cfg = {"lp_options": ["-o", "PageSize=Postcard", "-o", "print-scaling=none"]}
        with tempfile.TemporaryDirectory() as directory, patch.object(agent, "compose_layout") as compose, patch.object(agent, "request") as request, patch.object(agent, "submit_to_cups", return_value="cp1500-1") as submit, patch.object(agent, "wait_cups_job"):
            count = agent.print_custom_job(cfg, job, [Path("sheet.png")], Path(directory))
            self.assertEqual(count, 2)
            self.assertEqual(submit.call_count, 2)
            self.assertEqual(compose.call_args.args[-1], "custom-sheet")
            self.assertEqual([call.args[3]["completedCopies"] for call in request.call_args_list], [2, 3, 3, 4])

    def test_progress_failure_stops_before_next_sheet(self):
        job = {"jobId": 3, "copies": 3, "completedCopies": 0, "attempt": 1}
        cfg = {"lp_options": ["-o", "PageSize=Postcard", "-o", "print-scaling=none"]}
        with tempfile.TemporaryDirectory() as directory, patch.object(agent, "compose_layout"), patch.object(agent, "request", side_effect=[{}, RuntimeError("network lost")]), patch.object(agent, "submit_to_cups", return_value="cp1500-1") as submit, patch.object(agent, "wait_cups_job"):
            with self.assertRaises(RuntimeError):
                agent.print_custom_job(cfg, job, [Path("sheet.png")], Path(directory))
            self.assertEqual(submit.call_count, 1)

    def test_query_printer_reads_cups_ipp_reasons(self):
        body = (
            b"\x01\x01\x00\x00\x00\x00\x00\x01"
            + b"\x04"
            + agent._attr(0x23, "printer-state", struct.pack(">i", 5))
            + agent._attr(0x44, "printer-state-reasons", b"media-empty-error")
            + b"\x03"
        )

        class FakeResponse:
            def __init__(self, data):
                self.data = data

            def read(self):
                return self.data

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        with patch.object(agent.urllib.request, "urlopen", return_value=FakeResponse(body)), patch.object(agent, "printer_connected", return_value=True):
            self.assertEqual(agent.query_printer({"printer_name": "cp1500"}), ("stopped", ["media-empty-error"]))

    def test_stopped_queue_recovers_after_cooldown(self):
        calls = []

        def fake_run(cmd, timeout=30):
            calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 0, "", "")

        cfg = {"printer_name": "cp1500", "auto_recover_queue": True, "queue_recover_interval_sec": 180}
        with patch.object(agent, "printer_connected", return_value=True), patch.object(agent, "run", side_effect=fake_run):
            agent._queue_recovery_at = 0
            self.assertTrue(agent.maybe_recover_queue(cfg, "stopped"))
            self.assertFalse(agent.maybe_recover_queue(cfg, "stopped"))
        self.assertEqual(calls[0], ["cupsenable", "cp1500"])


if __name__ == "__main__":
    unittest.main()
