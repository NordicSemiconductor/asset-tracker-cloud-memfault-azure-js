import { matchDeviceBoundTopic } from './matchDeviceBoundTopic'

describe('matchTopic', () => {
	it('should match a simple topic', () =>
		expect(
			matchDeviceBoundTopic(
				'devices/49dd7d86-e547-4a4d-8f0f-f4b09591838c/messages/devicebound',
				'devices/49dd7d86-e547-4a4d-8f0f-f4b09591838c/messages/devicebound',
			),
		).toEqual(true))
	it('should match topic with a property bag', () =>
		expect(
			matchDeviceBoundTopic(
				'devices/49dd7d86-e547-4a4d-8f0f-f4b09591838c/messages/devicebound/pgps=result',
				'devices/49dd7d86-e547-4a4d-8f0f-f4b09591838c/messages/devicebound/%24.to=%2Fdevices%2F49dd7d86-e547-4a4d-8f0f-f4b09591838c%2Fmessages%2Fdevicebound&pgps=result&%24.ct=application%2Fjson&%24.ce=utf-8',
			),
		).toEqual(true))
	it('should not match topic with a property bag thats not contained', () =>
		expect(
			matchDeviceBoundTopic(
				'devices/49dd7d86-e547-4a4d-8f0f-f4b09591838c/messages/devicebound/agps=result',
				'devices/49dd7d86-e547-4a4d-8f0f-f4b09591838c/messages/devicebound/%24.to=%2Fdevices%2F49dd7d86-e547-4a4d-8f0f-f4b09591838c%2Fmessages%2Fdevicebound&pgps=result&%24.ct=application%2Fjson&%24.ce=utf-8',
			),
		).toEqual(false))
	it('should match a topic regardless of property bag', () =>
		expect(
			matchDeviceBoundTopic(
				'devices/49dd7d86-e547-4a4d-8f0f-f4b09591838c/messages/devicebound',
				'devices/49dd7d86-e547-4a4d-8f0f-f4b09591838c/messages/devicebound/%24.to=%2Fdevices%2F49dd7d86-e547-4a4d-8f0f-f4b09591838c%2Fmessages%2Fdevicebound&pgps=result&%24.ct=application%2Fjson&%24.ce=utf-8',
			),
		).toEqual(true))
})
