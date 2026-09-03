import CommonCrypto
import Foundation

func fingerprint(_ data: Data) -> [UInt8] {
    var digest = [UInt8](repeating: 0, count: Int(CC_MD5_DIGEST_LENGTH))
    CC_MD5((data as NSData).bytes, CC_LONG(data.count), &digest)
    return digest
}

func seal(_ data: Data, key: Data) {
    CCCrypt(UInt32(kCCEncrypt), UInt32(kCCAlgorithm3DES), UInt32(kCCOptionECBMode),
            (key as NSData).bytes, key.count, nil,
            (data as NSData).bytes, data.count, nil, 0, nil)
}
