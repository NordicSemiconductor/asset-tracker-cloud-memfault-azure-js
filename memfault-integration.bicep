@description('Specifies the name of the nRF Asset Tracker for Azure app')
@minLength(3)
param appName string = 'nrfassettracker'

@description('Specifies the storage account name to use, which is globally unique.')
@minLength(3)
param storageAccountName string = appName

@description('Location for all resources.')
param location string = resourceGroup().location

@description('The name of the IoT hub consumer group to user for Memfault messages')
@minLength(3)
param memfaultIotEventsConsumerGroupName string = 'memfault'

@description('Specifies the name of the key vault')
@minLength(3)
param keyVaultName string = 'assetTracker'

var keyVaultSecretsUser = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
var managedIdentity = '${appName}-memfault-integration-functionapp-identity'

resource iotHub 'Microsoft.Devices/IotHubs@2020-03-01' existing = {
  name: '${appName}IotHub'
}

resource consumerGroup 'Microsoft.Devices/iotHubs/eventhubEndpoints/ConsumerGroups@2020-03-01' = {
  name: '${appName}IotHub/events/${memfaultIotEventsConsumerGroupName}'
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2019-06-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
  }
}

resource serverFarm 'Microsoft.Web/serverfarms@2019-08-01' = {
  name: '${storageAccountName}Serverfarm'
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
  }
}

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2018-11-30'= {
  name: managedIdentity
  location: location
}

resource functionApp 'Microsoft.Web/sites@2022-03-01' = {
  name: '${appName}-memfault-integration'
  location: location
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned, UserAssigned'
    userAssignedIdentities: {
      '${resourceId('Microsoft.ManagedIdentity/userAssignedIdentities', managedIdentity)}': {}
    }
  }
  properties: {
    serverFarmId: serverFarm.id
    siteConfig: {
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~16'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'STORAGE_ACCESS_KEY'
          value: storageAccount.listKeys().keys[0].value
        }
        {
          name: 'STORAGE_ACCOUNT_NAME'
          value: storageAccountName
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: applicationInsights.properties.InstrumentationKey
        }
        {
          name: 'MEMFAULT_IOT_EVENTS_CONSUMER_GROUP_NAME'
          value: memfaultIotEventsConsumerGroupName
        }
        {
          name: 'IOTHUB_EVENTS_EVENT_HUB_NAME'
          value: iotHub.properties.eventHubEndpoints.events.path
        }
        {
          name: 'IOTHUB_EVENTS_CONNECTION_STRING'
          value: 'Endpoint=${iotHub.properties.eventHubEndpoints.events.endpoint};SharedAccessKeyName=iothubowner;SharedAccessKey=${iotHub.listkeys().value[0].primaryKey};EntityPath=${iotHub.properties.eventHubEndpoints.events.path}'
        }
        {
          name: 'KEYVAULT_NAME'
          value: keyVaultName
        }
        {
          name: 'AZURE_CLIENT_ID'
          value: reference(resourceId('Microsoft.ManagedIdentity/userAssignedIdentities', managedIdentity)).clientId
        }
      ]
      use32BitWorkerProcess: false
      cors: {
        allowedOrigins: [
          '*'
        ]
        supportCredentials: false
      }
      http20Enabled: true
      ftpsState: 'Disabled'
    }
    httpsOnly: true
  }
}

resource applicationInsights 'microsoft.insights/components@2020-02-02' = {
  name: '${storageAccountName}Insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    Request_Source: 'rest'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2021-11-01-preview' existing = {
  name: keyVaultName
}


resource keyVaultPermission 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid('Key Vault Secret User', appName , subscription().subscriptionId)
  properties: {
    roleDefinitionId: keyVaultSecretsUser
    principalId: reference(resourceId('Microsoft.ManagedIdentity/userAssignedIdentities', managedIdentity), '2018-11-30').principalId
    principalType: 'ServicePrincipal'
  }
  scope: keyVault
}
