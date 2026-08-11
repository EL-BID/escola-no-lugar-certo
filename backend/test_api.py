#!/usr/bin/env python
"""
Simple test script to verify API endpoints are working correctly.
Run this after starting the Django development server.
"""

import requests
import json

BASE_URL = "http://127.0.0.1:8001/api/v1"

def test_endpoint(url, description, method="GET", data=None):
    """Test an API endpoint and print results"""
    print(f"\n🧪 Testing: {description}")
    print(f"📡 {method} {url}")
    
    try:
        if method == "GET":
            response = requests.get(url)
        elif method == "POST":
            response = requests.post(url, json=data, headers={'Content-Type': 'application/json'})
        
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ Success!")
            # Print first few items if it's a list
            json_data = response.json()
            if isinstance(json_data, dict) and 'results' in json_data:
                print(f"📈 Count: {json_data.get('count', 'N/A')}")
                if json_data['results']:
                    print("📄 Sample result:")
                    print(json.dumps(json_data['results'][0], indent=2)[:500] + "...")
            elif isinstance(json_data, dict):
                print("📄 Response structure:")
                print(list(json_data.keys()))
        else:
            print("❌ Error!")
            print(f"📝 Response: {response.text}")
    
    except Exception as e:
        print(f"💥 Exception: {str(e)}")
    
    print("-" * 60)

def main():
    """Run all endpoint tests"""
    print("🚀 API Endpoint Tests")
    print("=" * 60)
    
    # Test 1: List all states
    test_endpoint(f"{BASE_URL}/states/", "List all states")
    
    # Test 2: Get state detail (if we have states)
    try:
        states_response = requests.get(f"{BASE_URL}/states/")
        if states_response.status_code == 200:
            states_data = states_response.json()
            if states_data.get('results'):
                state_code = states_data['results'][0]['code']
                test_endpoint(f"{BASE_URL}/states/{state_code}/", f"Get state detail for {state_code}")
                test_endpoint(f"{BASE_URL}/states/{state_code}/municipalities/", f"Get municipalities for {state_code}")
    except:
        pass
    
    # Test 3: List municipalities
    test_endpoint(f"{BASE_URL}/municipalities/", "List municipalities")
    
    # Test 4: List hexagons (general)
    test_endpoint(f"{BASE_URL}/hexagons/", "List hexagons (general)")
    
    # Test 5: Education data endpoint (should require state parameter)
    test_endpoint(f"{BASE_URL}/hexagons/education-data/", "Education data (without state - should fail)")
    
    # Test 6: Education data with state parameter
    test_endpoint(f"{BASE_URL}/hexagons/education-data/?state=42", "Education data for SC (code 42)")
    
    # Test 7: Analytics summary (should require state parameter)
    test_endpoint(f"{BASE_URL}/analytics/summary/", "Analytics summary (without state - should fail)")
    
    # Test 8: Analytics summary with state
    test_endpoint(f"{BASE_URL}/analytics/summary/?state=42", "Analytics summary for SC (code 42)")
    
    # Test 9: Analytics histogram (should require state and education levels)
    test_endpoint(f"{BASE_URL}/analytics/histogram/?state=42&education_levels=inf_cre", "Analytics histogram for SC (code 42)")
    
    # Test 10: List schools
    test_endpoint(f"{BASE_URL}/schools/", "List schools")
    
    # Test 11: Calculate needs (POST endpoint)
    calculate_data = {
        "state": "42",
        "resolution": 8,
        "education_levels": ["INF_CRE"],
        "parameters": {
            "pop_not_in_school_pct_inf_cre": 15.0,
            "students_private_pct_inf_cre": 8.5,
            "students_integral_pct_inf_cre": 25.0,
            "students_per_classroom_inf_cre": 15
        }
    }
    test_endpoint(f"{BASE_URL}/hexagons/calculate-needs/", "Calculate classroom needs", method="POST", data=calculate_data)
    
    print("\n🎉 Tests completed!")

if __name__ == "__main__":
    main()