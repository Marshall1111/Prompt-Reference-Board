import json
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


if __name__ == "__main__":
    unittest.main()
