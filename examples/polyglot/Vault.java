package com.example.vault;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.security.MessageDigest;
import java.security.KeyPairGenerator;
import java.util.Random;

public class Vault {
  public byte[] seal(byte[] data, byte[] key) throws Exception {
    Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
    cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"));
    return cipher.doFinal(data);
  }

  public byte[] legacy(byte[] data, byte[] key) throws Exception {
    Cipher tripleDes = Cipher.getInstance("DESede/CBC/PKCS5Padding");
    return tripleDes.doFinal(data);
  }

  public String fingerprint(byte[] data) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("MD5");
    return new String(digest.digest(data));
  }

  public KeyPairGenerator weakKeys() throws Exception {
    KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
    generator.initialize(1024);
    return generator;
  }

  public long sessionToken() {
    Random random = new Random();
    return random.nextLong();
  }
}
