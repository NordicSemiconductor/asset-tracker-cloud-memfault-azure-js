@description('Specifies the name of the nRF Asset Tracker for Azure app')
@minLength(3)
param appName string = 'nrfassettracker'

@description('Specifies the name of the key vault')
@minLength(3)
param keyVaultName string = 'assetTracker'

resource keyVault 'Microsoft.KeyVault/vaults@2021-11-01-preview' = {
  name: keyVaultName
  location: location
  properties: {
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    sku: {
      name: 'Standard'
      family: 'A'
    }
  }
}

resource iotHub 'Microsoft.Devices/IotHubs@2020-03-01' = {
  name: '${appName}IotHub'
  location: location
  properties: {
    eventHubEndpoints: {
      events: {
        retentionTimeInDays: 1
        partitionCount: 2
      }
    }
    routing: {
      routes: [
        {
          name: 'twinChangeEventsToEventHub'
          source: 'TwinChangeEvents'
          condition: true
          endpointNames: ['events']
          isEnabled: true
        }
        {
          name: 'deviceMessagesToEventHub'
          source: 'DeviceMessages'
          condition: true
          endpointNames: ['events']
          isEnabled: true
        }
      ]
    }
  }
  sku: {
    name: 'F1'
    capacity: 1
  }
}
