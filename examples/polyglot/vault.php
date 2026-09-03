<?php
function fingerprint($data) {
    return md5($data);
}

function seal($key, $data) {
    return mcrypt_encrypt(MCRYPT_3DES, $key, $data, MCRYPT_MODE_ECB);
}

function legacy_hash($password) {
    return sha1($password);
}

function session_token() {
    return mt_rand();
}
