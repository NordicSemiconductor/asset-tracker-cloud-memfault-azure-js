# Memfault integration for Azure IoT Hub

[![GitHub Actions](https://github.com/NordicSemiconductor/asset-tracker-cloud-memfault-azure-js/workflows/Test%20and%20Release/badge.svg)](https://github.com/NordicSemiconductor/asset-tracker-cloud-memfault-azure-js/actions)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovatebot.com)
[![@commitlint/config-conventional](https://img.shields.io/badge/%40commitlint-config--conventional-brightgreen)](https://github.com/conventional-changelog/commitlint/tree/master/@commitlint/config-conventional)
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

### Install dependencies

```bash
npm ci
```

### Setup

Export these environment variables for the Memfault integration stack:

```bash
export STORAGE_ACCOUNT_NAME=...
```

Export these environment variables from your nRF Asset Tracker for Azure
deployment:

```bash
export RESOURCE_GROUP=...
export APP_NAME=...
export KEY_VAULT_NAME=...
```

### Deploy

> **Note**  
> This adds the Memfault integration to the existing nRF Asset Tracker for Azure
> resources.

```bash
az deployment group create \
--mode Incremental \
--name memfault-integration-deployment \
--resource-group ${RESOURCE_GROUP:-nrfassettracker} \
--template-file memfault-integration.bicep \
--parameters \
    appName=${APP_NAME:-nrfassettracker} \
    keyVaultName=${KEY_VAULT_NAME:-assetTracker} \
    storageAccountName=${STORAGE_ACCOUNT_NAME:-nrfassettrackermemfault}

# Deploy the function app
npx tsc
npx tsx scripts/pack-app.ts
az functionapp deployment source config-zip -g ${RESOURCE_GROUP:-nrfassettracker} -n ${APP_NAME:-nrfassettracker}-memfault-integration --src dist/functionapp.zip
```

## Configure memfault settings

You can retrieve the project settings from the settings page of the Memfault
dashboard of your organization.

```bash
az keyvault secret set --vault-name ${KEY_VAULT_NAME:-assetTracker} --name memfaultProjectKey --value my-projectKey
az keyvault secret set --vault-name ${KEY_VAULT_NAME:-assetTracker} --name memfaultOrganization --value my-org
az keyvault secret set --vault-name ${KEY_VAULT_NAME:-assetTracker} --name memfaultProject --value my-project
```

The organization auth token can be accessed and managed by Administrators at
Admin → Organization Auth Tokens in the Memfault UI.

```bash
az keyvault secret set --vault-name ${KEY_VAULT_NAME:-assetTracker} --name memfaultAuthToken --value my-authToken
```

## End-to-end tests

### Set up the mock API

```bash
# Create a new resource group
az group create -n ${MOCK_API_RESOURCE_GROUP:-memfault-mock-api} -l ${LOCATION:-northeurope}

# Create the resources
az deployment group create \
--mode Complete \
--name manual-deployment \
--resource-group ${MOCK_API_RESOURCE_GROUP:-memfault-mock-api} \
--template-file mock-http-api.bicep \
--parameters \
    storageAccountName=${MOCK_API_STORAGE_ACCOUNT_NAME:-memfaultmockapi} \
    appName=${MOCK_API_APP_NAME}

# Deploy the function app
export MOCK_HTTP_API_ENDPOINT=`az functionapp show -g ${MOCK_API_RESOURCE_GROUP:-memfault-mock-api} -n ${MOCK_API_APP_NAME} | jq -r '.defaultHostName'`
echo $MOCK_HTTP_API_ENDPOINT
npx tsc
npx tsx scripts/pack-mock-http-api-app.ts
az functionapp deployment source config-zip -g ${MOCK_API_RESOURCE_GROUP:-memfault-mock-api} -n ${MOCK_API_APP_NAME} --src dist/mock-http-api.zip

# Configure Memfault Key value parameters
USER_OBJECT_ID=`az ad signed-in-user show --query id -o tsv`
# Assign 'Key Vault Secrets Officer' permission
az role assignment create --role b86a8fe4-44ce-4948-aee5-eccb2c155cd7 \
        --assignee ${USER_OBJECT_ID} \
        --scope /subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP:-memfault}/providers/Microsoft.KeyVault/vaults/${KEY_VAULT_NAME:-assetTracker}

az keyvault secret set --vault-name ${KEY_VAULT_NAME:-assetTracker} --name memfaultProjectKey --value my-projectKey
az keyvault secret set --vault-name ${KEY_VAULT_NAME:-assetTracker} --name memfaultOrganization --value my-org
az keyvault secret set --vault-name ${KEY_VAULT_NAME:-assetTracker} --name memfaultProject --value my-project
az keyvault secret set --vault-name ${KEY_VAULT_NAME:-assetTracker} --name memfaultAuthToken --value my-authToken
az keyvault secret set --vault-name ${KEY_VAULT_NAME:-assetTracker} --name memfaultApiEndpoint --value "https://${MOCK_HTTP_API_ENDPOINT}/api/api.memfault.com/"
az keyvault secret set --vault-name ${KEY_VAULT_NAME:-assetTracker} --name memfaultChunksEndpoint --value "https://${MOCK_HTTP_API_ENDPOINT}/api/chunks.memfault.com/"

# Observe Mock API logs
az webapp log tail --resource-group ${MOCK_API_RESOURCE_GROUP:-memfault-mock-api} --name ${MOCK_API_APP_NAME}

# Observe integration logs
az webapp log tail --resource-group ${RESOURCE_GROUP:-nrfassettracker} --name ${APP_NAME:-nrfassettracker}-memfault-integration

# Run the end-to-end tests
npm run test:e2e
```

## Continuous Integration

In order to continuously test this solution, authenticate GitHub Actions by
follow the instructions to
[Configure a service principal with a Federated Credential to use OIDC based authentication](https://github.com/Azure/login#configure-a-service-principal-with-a-federated-credential-to-use-oidc-based-authentication).
Use `https://nrfassettracker.invalid/memfault-ci` as the name.

From the command line this can be achieved using:

```bash
# Create application
az ad app create --display-name 'https://nrfassettracker.invalid/memfault-ci'
export APPLICATION_OBJECT_ID=`az ad app list | jq -r '.[] | select(.displayName=="https://nrfassettracker.invalid/memfault-ci") | .id' | tr -d '\n'`
# Create federated credentials
az rest --method POST --uri "https://graph.microsoft.com/beta/applications/${APPLICATION_OBJECT_ID}/federatedIdentityCredentials" --body '{"name":"GitHubActions","issuer":"https://token.actions.githubusercontent.com","subject":"repo:NordicSemiconductor/asset-tracker-cloud-memfault-azure-js:environment:ci","description":"Allow GitHub Actions to modify Azure resources","audiences":["api://AzureADTokenExchange"]}'
# Grant the application Owner permissions for subscription
export AZURE_CLIENT_ID=`az ad app list --display-name 'https://nrfassettracker.invalid/memfault-ci' | jq -r '.[].appId'`
export AZURE_SUBSCRIPTION_ID=`az account show | jq -r '.id'`
az ad sp create --id $AZURE_CLIENT_ID
az role assignment create --role Owner \
         --assignee ${AZURE_CLIENT_ID} \
         --scope /subscriptions/${AZURE_SUBSCRIPTION_ID}
```

Make sure to use the organization and repository name of your fork instead of
`NordicSemiconductor/asset-tracker-cloud-memfault-azure-js` in the command
above.

Then,

1. Store the application (client) ID of the service principal app registration
   created in step in the above step as a GitHub Actions secret
   ```bash
   gh secret set AZURE_CLIENT_ID --env ci --body `az ad app list --display-name 'https://nrfassettracker.invalid/memfault-ci' | jq -r '.[].appId'`
   ```
1. Store the directory (tenant) ID of the service principal app registration
   created in step in the above step as a GitHub Actions secret
   ```bash
   gh secret set AZURE_TENANT_ID --env ci --body `az account show | jq -r '.tenantId'`
   ```
1. Store the ID of the subscription which contains the resources as a GitHub
   Actions secret
   ```bash
   gh secret set AZURE_SUBSCRIPTION_ID --env ci --body `az account show | jq -r '.id'`
   ```
