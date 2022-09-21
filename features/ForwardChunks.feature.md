---
run: only
---

# Forward Chunks

> Devices can send Memfault chunks to `<deviceId>/memfault/<project key>` and
> they will be forwarded to the Memfault chunks API.

## Background

Given I connect a device

<!-- Prepare the mock API responses. -->

And I enqueue this mock HTTP API response with status code `202` for a `POST`
request to `chunks.memfault.com/api/v0/chunks/${deviceId}`

```
Content-Type: text/plain; charset=utf-8

Accepted
```

## Submit a chunk

> A typical base64 encoded message is
> `CAKnAgEDAQpqbnJmOTFucy1mdwlsMC4wLjErODIxOWRlBmh0aGluZ3k5MQtGghneFTnxBKEBjxoAA60jAAAAABkLBQAaABGUABQAAAcAABnr9tXZ`

When the device publishes this message to the topic
`${deviceId}/memfault/my-projectKey`

```
<chunk data>
```

Then the mock HTTP API should have been called with a `POST` request to
`chunks.memfault.com/api/v0/chunks/${deviceId}`

```
Memfault-Project-Key: my-projectKey
Content-Type: application/octet-stream

<chunk data>
```
