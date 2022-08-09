const deviceBoundTopicWithPropertyBagRx =
	/^devices\/[^/]+\/messages\/devicebound\/(?<propertyBag>.+)/

export const matchDeviceBoundTopic = (
	expectedTopic: string,
	actualTopic: string,
): boolean => {
	// Simple case
	if (expectedTopic === actualTopic) return true
	const expectedBag = new URLSearchParams(
		deviceBoundTopicWithPropertyBagRx.exec(expectedTopic)?.groups?.propertyBag,
	)
	const actualBag = new URLSearchParams(
		deviceBoundTopicWithPropertyBagRx.exec(actualTopic)?.groups?.propertyBag,
	)
	let allFound = true
	expectedBag.forEach((v, k) => {
		if (actualBag.get(k) !== v) allFound = false
	})
	return allFound
}
