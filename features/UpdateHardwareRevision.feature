Feature: Update Hardware Revisions

  The `dev.v.brdV` Thing shadow attribute should be synchronized to the device
  `hardware_version` on Memfault. 

  Background:

    Given I connect a device
    # Prepare the mock API responses.
    # First attempt should fail (the hardware version is not yet known)
    And I enqueue this mock HTTP API response with status code 404 for a PATCH request to api.memfault.com/api/v0/organizations/my-org/projects/my-project/devices/{deviceId}
    """
    Content-Type: application/json

    {
      "error": {
        "code": 1003,
        "http_code": 404,
        "message": "HardwareVersion with name `nrf9160dk_nrf9160-v42` not found",
        "type": "NotFoundError"
      }
    }
    """
    # List software version
    And I enqueue this mock HTTP API response with status code 200 for a GET request to api.memfault.com/api/v0/organizations/my-org/projects/my-project/software_types?page=1&per_page=5000
    """
    Content-Type: application/json

    {
      "data": [
        {
          "archived": false,
          "created_date": "2022-03-16T08:48:16.115301+00:00",
          "id": 20069,
          "latest_software_version": null,
          "name": "0.0.0-development-48b1d466fb320151a2c7a2005e58c2cfa74974d2-thingy91_nrf9160_ns-debugWithMemfault",
          "software_version_string_format": null,
          "software_versions_count": 0
        },
        {
          "archived": false,
          "created_date": "2022-03-15T12:41:21.279318+00:00",
          "id": 20046,
          "latest_software_version": {
            "archived": false,
            "created_date": "2022-03-15T12:41:27.360115+00:00",
            "id": 137904,
            "revision": "",
            "software_type": { "id": 20046, "name": "asset_tracker_v2" },
            "symbol_file": { "downloadable": true, "id": 127923 },
            "updated_date": "2022-04-08T11:53:31.601088+00:00",
            "version": "0.0.0-development-thingy91_nrf9160_ns-debugWithMemfault"
          },
          "name": "asset_tracker_v2",
          "software_version_string_format": null,
          "software_versions_count": 16
        },
        {
          "archived": false,
          "created_date": "2022-03-14T16:11:37.652537+00:00",
          "id": 20029,
          "latest_software_version": {
            "archived": false,
            "created_date": "2022-04-08T08:35:08.269310+00:00",
            "id": 149495,
            "revision": "",
            "software_type": { "id": 20029, "name": "nrf91ns-fw" },
            "updated_date": "2022-04-08T08:35:08.379507+00:00",
            "version": "0.0.1+8219de"
          },
          "name": "nrf91ns-fw",
          "software_version_string_format": null,
          "software_versions_count": 2
        }
      ],
      "paging": {
        "item_count": 3,
        "page": 1,
        "page_count": 1,
        "per_page": 5000,
        "total_count": 3
      }
    }
    """
    # Create hardware version
    And I enqueue this mock HTTP API response with status code 200 for a POST request to api.memfault.com/api/v0/organizations/my-org/projects/my-project/hardware_versions
    """
    Content-Type: application/json

    {
      "data": {
        "count_devices": 0,
        "name": "nrf9160dk_nrf9160-v42",
        "primary_software_type": {
          "archived": false,
          "created_date": "2022-03-16T08:48:16.115301+00:00",
          "id": 20069,
          "latest_software_version": null,
          "name": "0.0.0-development-48b1d466fb320151a2c7a2005e58c2cfa74974d2-thingy91_nrf9160_ns-debugWithMemfault",
          "software_version_string_format": null,
          "software_versions_count": 0
        },
        "software_types": [
          {
            "id": 20069,
            "name": "0.0.0-development-48b1d466fb320151a2c7a2005e58c2cfa74974d2-thingy91_nrf9160_ns-debugWithMemfault"
          }
        ]
      }
    }
    """
    # Second attempt should pass
    And I enqueue this mock HTTP API response with status code 202 for a PATCH request to api.memfault.com/api/v0/organizations/my-org/projects/my-project/devices/{deviceId}
    """
    Content-Type: application/json

    {
      "data": {
        "attributes_manual_resolution": null,
        "attributes_resolution": "normal",
        "cohort": { "id": 161175, "name": "default", "slug": "default" },
        "created_date": "2022-03-28T12:31:53.869831+00:00",
        "debugging_manual_resolution": null,
        "debugging_resolution": "normal",
        "description": "",
        "device_serial": "{deviceId}",
        "hardware_version": { "name": "nrf9160dk_nrf9160-v42" },
        "id": 3848748,
        "last_seen": "2022-04-08T13:07:30.016000+00:00",
        "last_seen_software_version": {
          "archived": false,
          "id": 143068,
          "software_type": { "id": 20029, "name": "nrf91ns-fw" },
          "version": "0.0.1+32a02f"
        },
        "nickname": "My-Device",
        "project": {
          "id": 726,
          "name": "nRF Asset Tracker",
          "slug": "my-project"
        },
        "timeseries_manual_resolution": null,
        "timeseries_resolution": "normal",
        "updated_date": "2022-04-08T13:34:36.473838+00:00"
      }
    }
    """

  Scenario: Update the Thing shadow of the device

    Given I update the Thing reported shadow to
    """
    {
      "dev": {
        "v": {
          "brdV": "nrf9160dk_nrf9160-v42"
        }
      }
    }
    """
    Then the mock HTTP API should have been called with a PATCH request to api.memfault.com/api/v0/organizations/my-org/projects/my-project/devices/{deviceId}
    """
    Content-Type: application/json; charset=utf-8
    
    {"hardware_version":"nrf9160dk_nrf9160-v42"}
    """
    And the mock HTTP API should have been called with a GET request to api.memfault.com/api/v0/organizations/my-org/projects/my-project/software_types?page=1&per_page=5000
    And the mock HTTP API should have been called with a POST request to api.memfault.com/api/v0/organizations/my-org/projects/my-project/hardware_versions
    """
    Content-Type: application/json; charset=utf-8
          
    {"name":"nrf9160dk_nrf9160-v42","primary_software_type":"0.0.0-development-48b1d466fb320151a2c7a2005e58c2cfa74974d2-thingy91_nrf9160_ns-debugWithMemfault"}
    """
    Then the mock HTTP API should have been called with a PATCH request to api.memfault.com/api/v0/organizations/my-org/projects/my-project/devices/{deviceId}
    """
    Content-Type: application/json; charset=utf-8
    
    {"hardware_version":"nrf9160dk_nrf9160-v42"}
    """