// https://docs.microsoft.com/en-us/azure/azure-functions/functions-create-first-function-bicep?tabs=CLI%2Cvisual-studio-code
@description('Specifies the name of the IoT Hub to use.')
@minLength(3)
param iotHubName string = 'nrfassettrackerIotHub'

@description('Specifies the resource group of the IoT Hub to use.')
@minLength(3)
param iotHubResourceGroup string = 'nrfassettracker'

@description('Specifies the name of the Key vault.')
@minLength(3)
param keyVaultName string = 'MemfaultIntegration'

@description('Specifies the storage account name to use, which is globally unique.')
@minLength(3)
param storageAccountName string = 'MemfaultIntegration'

@description('Location for all resources')
@minLength(3)
param location string = resourceGroup().location

@description('Storage Account type')
@allowed([
  'Standard_LRS'
  'Standard_GRS'
  'Standard_RAGRS'
])
param storageAccountType string = 'Standard_LRS'

var functionAppName = 'MemfaultIntegration'
var managedIdentityName = 'MemfaultIntegration-functionapp-identity'
var memfaultMessagesIotEventsConsumerGroupName = 'memfaultMessages'

resource iotHub 'Microsoft.Devices/IotHubs@2021-07-02' existing = {
  name:iotHubName
  scope: resourceGroup(iotHubResourceGroup)
}

module consumerGroupModule './memfault-consumer-group.bicep' = {
  name: 'consumerGroupDeploy'
  params: {
    iotHubName: iotHubName
    consumerGroupName: memfaultMessagesIotEventsConsumerGroupName
  }
  scope: resourceGroup(iotHubResourceGroup)
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2021-09-01' = {
  name: toLower(storageAccountName)
  location: location
  sku: {
    name: storageAccountType
  }
  kind: 'StorageV2'
}

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2022-01-31-preview'= {
  name: managedIdentityName
  location: location
}

resource keyVault 'Microsoft.KeyVault/vaults@2022-07-01' ={
  name: keyVaultName
  location: location
  properties:{
    enableRbacAuthorization:true
    enabledForDeployment:false
    enabledForDiskEncryption:false
    enabledForTemplateDeployment:false
    tenantId:subscription().tenantId
    sku:{
      name:'standard'
      family:'A'
    }
  }
}

resource serverFarm 'Microsoft.Web/serverfarms@2022-03-01' = {
  name: functionAppName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {

  }
}

resource functionApp 'Microsoft.Web/sites@2022-03-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: serverFarm.id
    siteConfig: {
      appSettings: [
              {
                name: 'AZURE_CLIENT_ID'
                value: managedIdentity.properties.clientId
              }
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower(functionAppName)
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~3'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: applicationInsights.properties.InstrumentationKey
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~14'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'STORE_DEVICE_UPDATES_IOT_EVENTS_CONSUMER_GROUP_NAME'
          value: consumerGroupModule.outputs.consumerGroupName
        }
        {
          name: 'IOTHUB_EVENTS_CONNECTION_STRING'
          value: 'Hostname=${iotHub.properties.eventHubEndpoints.events.endpoint};SharedAccessKeyName=iothubowner;SharedAccessKey=${iotHub.listkeys().value[0].primaryKey};EntityPath=${iotHub.properties.eventHubEndpoints.events.path}'
        }
        {
          name: 'IOTHUB_EVENTS_EVENT_HUB_NAME'
          value: iotHub.properties.eventHubEndpoints.events.path
        }
        {
          name: 'KEYVAULT_NAME'
          value: keyVault.name
        }
      ]
      ftpsState: 'FtpsOnly'
      minTlsVersion: '1.2'
    }
    httpsOnly: true
  }
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${functionAppName}Insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    Request_Source: 'rest'
  }
}

resource keyVaultAccessPermissionForApp 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id)
  scope: keyVault
  properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
      principalId: managedIdentity.properties.principalId
      principalType: 'ServicePrincipal'

  }
}

