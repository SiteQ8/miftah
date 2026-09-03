using System;
using System.Net.Http;
using System.Security.Cryptography;

namespace Example.Vault {
  public class Vault {
    public byte[] Fingerprint(byte[] data) {
      var sha = new SHA1Managed();
      return sha.ComputeHash(data);
    }

    public byte[] Seal(byte[] data) {
      var provider = new TripleDESCryptoServiceProvider();
      provider.Mode = CipherMode.ECB;
      return provider.CreateEncryptor().TransformFinalBlock(data, 0, data.Length);
    }

    public HttpClient Insecure() {
      var handler = new HttpClientHandler();
      handler.ServerCertificateCustomValidationCallback = (m, cert, chain, errors) => true;
      return new HttpClient(handler);
    }
  }
}
