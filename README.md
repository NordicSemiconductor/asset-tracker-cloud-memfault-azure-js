# Memfault integration for Azure IoT Hub

[![GitHub Actions](https://github.com/NordicSemiconductor/asset-tracker-cloud-memfault-azure-js/workflows/Test%20and%20Release/badge.svg)](https://github.com/NordicSemiconductor/asset-tracker-cloud-memfault-azure-js/actions)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovatebot.com)
[![Mergify Status](https://img.shields.io/endpoint.svg?url=https://gh.mergify.io/badges/NordicSemiconductor/asset-tracker-cloud-memfault-azure-js)](https://mergify.io)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier/)
[![ESLint: TypeScript](https://img.shields.io/badge/ESLint-TypeScript-blue.svg)](https://github.com/typescript-eslint/typescript-eslint)

Memfault integration for Azure IoT Hub developed in
[TypeScript](https://www.typescriptlang.org/).

### Device information

Meta information about devices is populated by cloud when devices report their
values

- board type
  ([`hardware_version`](https://api-docs.memfault.com/#f2acc282-23f9-409b-a99b-41da759b82f9))
  is inferred cloud side from
  [`dev.v.brdV`](https://github.com/NordicSemiconductor/asset-tracker-cloud-docs/blob/84da0a8c790bb789dfbcf43050be4cb5f0e65171/docs/cloud-protocol/state.reported.schema.json#L139-L144)
  Thing shadow property.
- [`nickname`](https://api-docs.memfault.com/#f2acc282-23f9-409b-a99b-41da759b82f9)
  is inferred from the user's name setting for the device using the `name` Thing
  attribute.

### Chunks

The Memfault SDK
[packages the data from all modules in _chunks_](https://docs.memfault.com/docs/mcu/data-from-firmware-to-the-cloud/).
They are received via MQTT and forwared to the Memfault chunks API.

Memfault embeds offset information in each chunk so they can re-assemble data
that arrives out of order, so there is no need to buffer the chunks on the
cloudside.

Devices publish the chunks via MQTT to a configurable topic. Right now the
`asset_tracker_v2`
[uses `<deviceId>/memfault/<Memfault project key>`](https://github.com/nrfconnect/sdk-nrf/blob/5ed65dc037426206b103cc7ce3274de98b6cc93d/applications/asset_tracker_v2/src/cloud/aws_iot_integration.c#L35-L38),
however `deviceId` and `Memfault project key` are superfluous because they can
be inferred on the cloud side from the MQTT connection.

To support devices publishing to a MQTT topic named `memfault` directly, the
Memfault project key
[needed for chunks API](https://api-docs.memfault.com/#a8d3e36f-62f0-4120-9fc6-544ee04f3bb5)
is stored on the cloud side in an SSM parameter.

This also allows for changing the project key on the fly if needed without
needing deploy a new firmware to devices. However, note that the project key is
not a secret and does not need rotation.

It is also useful to have the Memfault project key on the device to directly
publish to the Memfault HTTP API to be able to debug problems with the MQTT
connections.

This can however also be solved by setting up an API endpoint the accepts
requests signed with JWT tokens created using the devices keypair. This would
allow to remove the Memfault project key entirely from the firmware. Right now
however this is not supported in nRF Connect SDK. Please reach out if you would
like to see this feature.

## Installation in your Azure account

### Setup

    // FIXME: document

Install the dependencies:

    npm ci

### Deploy

> **Note**  
> This adds the memfault integration to the existing nRF Asset Tracker for Azure
> resources.

    az deployment group create \
    --mode Incremental \
    --name manual-deployment \
    --resource-group ${RESOURCE_GROUP:-nrfassettracker} \
    --template-file memfault-integration.bicep \
    --parameters \
        appName=${APP_NAME:-nrfassettracker} \
        keyVaultName=${KEY_VAULT_NAME:-assetTracker} \
        storageAccountName=${STORAGE_ACCOUNT_NAME:-nrfassettracker}

    # Deploy the function app
    npx tsx scripts/pack-app.ts
    az functionapp deployment source config-zip -g ${RESOURCE_GROUP:-nrfassettracker} -n ${APP_NAME:-nrfassettracker}-memfault-integration --src dist/functionapp.zip

## Configure memfault settings

You can retrieve the project settings from the settings page of the Memfault
dashboard of your organization.

    // FIXME: document / projectKey --value <your Memfault project key>
    // FIXME: document / organization --value <your organization slug>
    // FIXME: document / project --value <your project slug>

The organization auth token can be accessed and managed by Administrators at
Admin → Organization Auth Tokens in the Memfault UI.

    // FIXME: document / authToken --value <your auth token>

## End-to-end tests

### Set up the mock API

    # Create a new resource group
    az group create -n ${MOCK_API_RESOURCE_GROUP:-memfault-mock-api} -l ${LOCATION:-northeurope}

    # Create the resources
    az deployment group create \
    --mode Complete \
    --name manual-deployment \
    --resource-group ${MOCK_API_RESOURCE_GROUP:-memfault-mock-api} \
    --template-file mock-http-api.bicep \
    --parameters \
        storageAccountName=${MOCK_API_STORAGE_ACCOUNT_NAME:-memfaultmockapi}

    # Deploy the function app
    export MOCK_HTTP_API_ENDPOINT=`az functionapp show -g ${MOCK_API_RESOURCE_GROUP:-memfault-mock-api} -n MockHttpAPI | jq -r '.defaultHostName'`
    echo $MOCK_HTTP_API_ENDPOINT
    npx tsx scripts/pack-mock-http-api-app.ts
    az functionapp deployment source config-zip -g ${MOCK_API_RESOURCE_GROUP:-memfault-mock-api} -n MockHttpAPI --src dist/mock-http-api.zip

    # Configure Memfault Key value parameters
    USER_OBJECT_ID=`az ad signed-in-user show --query id -o tsv`
    # Assign 'Key Vault Secrets Officer' permission
    az role assignment create --role b86a8fe4-44ce-4948-aee5-eccb2c155cd7 \
         --assignee ${USER_OBJECT_ID} \
         --scope /subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP:-memfault}/providers/Microsoft.KeyVault/vaults/${KEY_VAULT_NAME:-MemfaultIntegration}

    az keyvault secret set --vault-name ${KEY_VAULT_NAME:-MemfaultIntegration} --name  projectKey --value my-projectKey
    az keyvault secret set --vault-name ${KEY_VAULT_NAME:-MemfaultIntegration} --name  organization --value my-org
    az keyvault secret set --vault-name ${KEY_VAULT_NAME:-MemfaultIntegration} --name  project --value my-project
    az keyvault secret set --vault-name ${KEY_VAULT_NAME:-MemfaultIntegration} --name  authToken --value my-authToken
    az keyvault secret set --vault-name ${KEY_VAULT_NAME:-MemfaultIntegration} --name  apiEndpoint --value $MOCK_HTTP_API_ENDPOINT/api.memfault.com
    az keyvault secret set --vault-name ${KEY_VAULT_NAME:-MemfaultIntegration} --name  chunksEndpoint --value $MOCK_HTTP_API_ENDPOINT/chunks.memfault.com

    # Observe logs
    az webapp log tail --resource-group ${MOCK_API_RESOURCE_GROUP:-memfault-mock-api} --name MockHttpAPI

    # Run the end-to-end tests
    npm run test:e2e

### Deploy app

    npx tsx scripts/pack-app.ts
    az functionapp deployment source config-zip -g ${RESOURCE_GROUP:-memfault} -n MemfaultIntegration --src dist/functionapp.zip

    # Observe logs
    az webapp log tail --resource-group ${RESOURCE_GROUP:-memfault} --name MemfaultIntegration
