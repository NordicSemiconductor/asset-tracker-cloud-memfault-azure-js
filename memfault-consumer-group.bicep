@description('Specifies the name of the IoT Hub to use.')
@minLength(3)
param iotHubName string = 'nrfassettrackerIotHub'

@description('Specifies the name of the consumer group to use.')
@minLength(3)
param consumerGroupName  string = 'memfaultMessages'

// Not sure if this survives an update to nRF Asset Tracker
// Maybe needs to be deployed manually
resource consumerGroup 'Microsoft.Devices/iotHubs/eventhubEndpoints/ConsumerGroups@2020-03-01' = {
  name: '${iotHubName}/events/${consumerGroupName}'
}

output consumerGroupId string = consumerGroup.id
output consumerGroupName string = consumerGroup.name
