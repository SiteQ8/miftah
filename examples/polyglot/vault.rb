require 'openssl'

def fingerprint(data)
  OpenSSL::Digest::MD5.new.digest(data)
end

def seal(key, data)
  cipher = OpenSSL::Cipher.new('DES-EDE3-CBC')
  cipher.encrypt
  cipher.key = key
  cipher.update(data) + cipher.final
end
