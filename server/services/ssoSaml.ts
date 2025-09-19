import crypto from 'crypto';
import zlib from 'zlib';
import { storage } from '../storage';

export class SamlService {
  get config() {
    const { SAML_ENTITY_ID, SAML_ACS_URL, SAML_IDP_SSO_URL, SAML_IDP_ENTITY_ID, SAML_CERT_PEM } = process.env as Record<string, string | undefined>;
    if (!SAML_ENTITY_ID || !SAML_ACS_URL || !SAML_IDP_SSO_URL || !SAML_IDP_ENTITY_ID || !SAML_CERT_PEM) throw new Error('SAML config missing');
    return { spEntityId: SAML_ENTITY_ID, acsUrl: SAML_ACS_URL, idpSsoUrl: SAML_IDP_SSO_URL, idpEntityId: SAML_IDP_ENTITY_ID, certPem: SAML_CERT_PEM };
  }

  metadataXml(): string {
    const c = this.config;
    return `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${c.spEntityId}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${c.acsUrl}" index="1"/>
  </SPSSODescriptor>
</EntityDescriptor>`;
  }

  buildLoginUrl(): string {
    const c = this.config;
    const req = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_${crypto.randomUUID()}" Version="2.0" IssueInstant="${new Date().toISOString()}" Destination="${c.idpSsoUrl}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" AssertionConsumerServiceURL="${c.acsUrl}"><saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${c.spEntityId}</saml:Issuer></samlp:AuthnRequest>`;
    const deflated = zlib.deflateRawSync(Buffer.from(req));
    const b64 = deflated.toString('base64');
    return `${c.idpSsoUrl}?SAMLRequest=${encodeURIComponent(b64)}`;
  }

  verifyAssertion(xml: string): { email?: string; nameId?: string } {
    // Minimal parsing; production should use a library
    const c = this.config;
    const hasIssuer = xml.includes(c.idpEntityId);
    if (!hasIssuer) throw new Error('Invalid issuer');
    const emailMatch = xml.match(/<saml:Attribute Name="email">[\s\S]*?<saml:AttributeValue>([^<]+)</);
    const nameIdMatch = xml.match(/<saml:NameID[^>]*>([^<]+)</);
    return { email: emailMatch?.[1], nameId: nameIdMatch?.[1] };
  }
}

export const samlService = new SamlService();


