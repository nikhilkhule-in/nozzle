"""Payload codecs: json for readable values, msgpack for compact values plus bytes.

The orchestrator never decodes payloads; these run in SDKs and workers of the
same workflow language. Arbitrary custom classes are rejected loudly — tasks
must return JSON-like values, bytes, or dataclasses converted via
to_dict/from_dict at the boundary. msgpack is the one MVP binary codec;
cbor/protobuf/capnp remain future opt-in codecs.
"""

import json

JSON_CODEC = "json"
MSGPACK_CODEC = "msgpack"

SUPPORTED = (JSON_CODEC, MSGPACK_CODEC)


def _reject(value, codec):
    raise ValueError(
        f"cannot encode {type(value).__name__} with {codec!r}: return "
        "JSON-like values, bytes (msgpack only), or convert custom objects "
        "with to_dict() at the task boundary"
    )


def encode(value, codec=MSGPACK_CODEC):
    """Encode a task value to bytes. Returns (payload_bytes, codec_used)."""
    if codec == JSON_CODEC:
        if isinstance(value, (bytes, bytearray)):
            raise ValueError(
                "cannot encode bytes with 'json' (no native binary type); "
                "use 'msgpack'"
            )
        try:
            return json.dumps(value).encode("utf-8"), JSON_CODEC
        except (TypeError, ValueError):
            _reject(value, codec)
    if codec == MSGPACK_CODEC:
        import msgpack

        try:
            return msgpack.packb(value, use_bin_type=True), MSGPACK_CODEC
        except (TypeError, ValueError):
            _reject(value, codec)
    raise ValueError(f"unknown codec {codec!r}; expected one of {SUPPORTED}")


def decode(payload, codec):
    """Decode payload bytes produced by :func:`encode`."""
    if codec == JSON_CODEC:
        return json.loads(payload.decode("utf-8"))
    if codec == MSGPACK_CODEC:
        import msgpack

        return msgpack.unpackb(payload, raw=False)
    raise ValueError(f"unknown codec {codec!r}; expected one of {SUPPORTED}")
