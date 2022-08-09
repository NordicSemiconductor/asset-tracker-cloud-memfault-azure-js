Feature: Update Nickname

  The `name` Thing attribute should be synchronized to the device
  `nickname` on Memfault. 

  Background:

    Given I connect a device
    # Prepare the mock API responses.
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
        "hardware_version": { "name": "nrf9160dk_nrf9160" },
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
          "slug": "nrf-asset-tracker"
        },
        "timeseries_manual_resolution": null,
        "timeseries_resolution": "normal",
        "updated_date": "2022-04-08T13:30:57.651738+00:00"
      }
    }
    """

  Scenario: Update the Thing name attribute of the device

    Given I update the Thing attribute "name" to "My-Device"
    Then the mock HTTP API should have been called with a PATCH request to api.memfault.com/api/v0/organizations/my-org/projects/my-project/devices/{deviceId}
      """
      Content-Type: application/json; charset=utf-8
      
      {"nickname":"My-Device"}
      """