"""Task 4.3 verification: codec round-trips and loud rejections."""

import pytest

from nozzle.codecs import decode, encode


class Custom:
    pass


VALUES = [
    "hello",
    42,
    3.5,
    True,
    None,
    {"a": [1, 2, {"b": "c"}]},
    [{"x": None}, [], {}],
]


@pytest.mark.parametrize("codec", ["json", "msgpack"])
@pytest.mark.parametrize("value", VALUES)
def test_round_trip(codec, value):
    payload, used = encode(value, codec)
    assert used == codec
    assert isinstance(payload, bytes)
    assert decode(payload, codec) == value


def test_msgpack_supports_bytes():
    payload, used = encode(b"\x00\x01raw", "msgpack")
    assert used == "msgpack"
    assert decode(payload, "msgpack") == b"\x00\x01raw"


def test_json_rejects_bytes_with_guidance():
    with pytest.raises(ValueError, match="msgpack"):
        encode(b"raw", "json")


@pytest.mark.parametrize("codec", ["json", "msgpack"])
def test_custom_objects_rejected_loudly(codec):
    with pytest.raises(ValueError, match="Custom"):
        encode(Custom(), codec)


def test_unknown_codec_rejected():
    with pytest.raises(ValueError, match="unknown codec"):
        encode({"a": 1}, "cbor")
    with pytest.raises(ValueError, match="unknown codec"):
        decode(b"{}", "cbor")
