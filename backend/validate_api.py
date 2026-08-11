#!/usr/bin/env python
"""
Final API endpoint validation script.
Tests all endpoints and provides a summary report.
"""

import requests
import json
import sys

BASE_URL = "http://127.0.0.1:8001/api/v1"

def test_endpoint_simple(url, method="GET", data=None, expected_status=200):
    """Simple test that returns success/failure"""
    try:
        if method == "GET":
            response = requests.get(url, timeout=10)
        elif method == "POST":
            response = requests.post(url, json=data, headers={'Content-Type': 'application/json'}, timeout=30)
        
        return response.status_code == expected_status, response.status_code
    except Exception as e:
        return False, f"Error: {str(e)}"

def main():
    """Run endpoint validation"""
    print("🔧 API Endpoint Validation")
    print("=" * 50)
    
    tests = [
        ("States List", "GET", f"{BASE_URL}/states/", None, 200),
        ("States Detail", "GET", f"{BASE_URL}/states/42/", None, 200),
        ("Municipalities List", "GET", f"{BASE_URL}/municipalities/", None, 200),
        ("Hexagons List", "GET", f"{BASE_URL}/hexagons/", None, 200),
        ("Education Data (no state)", "GET", f"{BASE_URL}/hexagons/education-data/", None, 400),
        ("Education Data (with state)", "GET", f"{BASE_URL}/hexagons/education-data/?state=42", None, 200),
        ("Analytics Summary", "GET", f"{BASE_URL}/analytics/summary/?state=42", None, 200),
        ("Analytics Histogram", "GET", f"{BASE_URL}/analytics/histogram/?state=42&education_levels=inf_cre", None, 200),
        ("Schools List", "GET", f"{BASE_URL}/schools/", None, 200),
        ("Calculate Needs", "POST", f"{BASE_URL}/hexagons/calculate-needs/", {
            "state": "42",
            "resolution": 8,
            "education_levels": ["INF_CRE"],
            "parameters": {
                "pop_not_in_school_pct_inf_cre": 15.0,
                "students_private_pct_inf_cre": 8.5,
                "students_integral_pct_inf_cre": 25.0,
                "students_per_classroom_inf_cre": 15
            }
        }, 200),
    ]
    
    results = []
    
    for name, method, url, data, expected_status in tests:
        print(f"Testing {name}...", end=" ")
        success, status = test_endpoint_simple(url, method, data, expected_status)
        
        if success:
            print("✅")
            results.append((name, True, status))
        else:
            print(f"❌ ({status})")
            results.append((name, False, status))
    
    print("\n" + "=" * 50)
    print("📊 RESULTS SUMMARY")
    print("=" * 50)
    
    passed = sum(1 for _, success, _ in results if success)
    total = len(results)
    
    for name, success, status in results:
        status_icon = "✅" if success else "❌"
        print(f"{status_icon} {name:<30} {status}")
    
    print(f"\n🎯 OVERALL: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("🎉 All API endpoints are working correctly!")
        return 0
    else:
        print("⚠️  Some endpoints need attention.")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)