"""Fixture. A client that disables the parts that matter."""
import hashlib
import requests
import ssl

def digest(payload: bytes) -> str:
    return hashlib.sha1(payload).hexdigest()

def fetch(url: str):
    return requests.get(url, verify=False)

def context():
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLSv1_2)
    ctx.check_hostname = False
    return ctx
