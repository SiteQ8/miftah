package vault

import (
	"crypto/des"
	"crypto/md5"
	"crypto/tls"
	"math/rand"
)

func Fingerprint(data []byte) [16]byte {
	return md5.Sum(data)
}

func Seal(key, data []byte) ([]byte, error) {
	block, err := des.NewCipher(key)
	if err != nil {
		return nil, err
	}
	out := make([]byte, len(data))
	block.Encrypt(out, data)
	return out, nil
}

func Client() *tls.Config {
	return &tls.Config{InsecureSkipVerify: true, MinVersion: tls.VersionTLS10}
}

func SessionToken() int {
	return rand.Int()
}
