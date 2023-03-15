@description('Specifies the name of the nRF Asset Tracker for Azure app')
@minLength(3)
param appName string = 'nrfassettracker'

@description('Specifies the name of the key vault')
@minLength(3)
param keyVaultName string = 'assetTracker'

@description('Location for all resources.')
param location string = resourceGroup().location

resource keyVault 'Microsoft.KeyVault/vaults@2022-11-01' = {
  name: keyVaultName
  location: location
  properties: {
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    tenantId: subscription().tenantId
    sku: {
      name: 'standard'
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
          endpointNames: ['events']
          isEnabled: true
        }
        {
          name: 'deviceMessagesToEventHub'
          source: 'DeviceMessages'
          endpointNames: ['events']
          isEnabled: true
        }
      ]
    }
  }
  sku: {
    name: 'S1'
    capacity: 1
  }
}
