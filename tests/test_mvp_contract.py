import unittest

from app import app, plan_robot_route


class SafePlanTests(unittest.TestCase):
    def test_low_confidence_manual(self):
        plan = plan_robot_route("plastic", 0.48, [
            {"label": "plastic", "confidence": 48},
            {"label": "paper", "confidence": 45},
        ])
        self.assertEqual(plan["code"], "MANUAL_REVIEW")
        self.assertFalse(plan["hardware_command_sent"])

    def test_ambiguous_predictions_manual(self):
        plan = plan_robot_route("plastic", 0.77, [
            {"label": "plastic", "confidence": 77},
            {"label": "glass", "confidence": 72},
        ])
        self.assertEqual(plan["code"], "MANUAL_REVIEW")

    def test_metal_requires_ferrous_sensor(self):
        plan = plan_robot_route("metal", 0.96, [
            {"label": "metal", "confidence": 96},
            {"label": "paper", "confidence": 2},
        ])
        self.assertEqual(plan["code"], "FERROUS_SENSOR_CHECK")
        self.assertEqual(plan["mode"], "simulation")
        self.assertIsNone(plan["calibrated_pick_coordinates"])

    def test_organic_passes_in_simulation(self):
        plan = plan_robot_route("organic", 0.92, [
            {"label": "organic", "confidence": 92},
            {"label": "plastic", "confidence": 3},
        ])
        self.assertEqual(plan["code"], "CONVEYOR_PASS")
        self.assertFalse(plan["hardware_command_sent"])

    def test_endpoint_reports_no_actuation(self):
        with app.test_client() as client:
            response = client.get("/api/robot/status")
            self.assertEqual(response.status_code, 200)
            self.assertFalse(response.json["connected"])
            self.assertFalse(response.json["actuation_enabled"])

    def test_bbox_rejected_without_network(self):
        with app.test_client() as client:
            for query in ("", "nan,44,41,50", "40,49,39,50", "40,49,40.5,49.6"):
                response = client.get("/api/containers", query_string={"bbox": query})
                self.assertIn(response.status_code, (400, 422))


if __name__ == "__main__":
    unittest.main()
