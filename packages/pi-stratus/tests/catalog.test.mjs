// Catalog integrity tests (T006 carry-over, built early).
// Deterministic, offline, no network, no credentials.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, catalogEntry, isKnownService, placementMatches, CATEGORY_HEX } from "../src/cloud.ts";

const ids = new Set(CATALOG.map((e) => e.id));

test("catalog entries are unique and complete", () => {
  assert.equal(ids.size, CATALOG.length, "duplicate catalog ids");
  for (const e of CATALOG) {
    assert.ok(e.id.length > 0, "empty id");
    assert.ok(e.label.length > 0, `empty label: ${e.id}`);
    assert.ok(CATEGORY_HEX[e.category], `unknown category: ${e.id}`);
    assert.ok(e.providers.length > 0, `no providers: ${e.id}`);
    assert.ok(e.glyph.lettermark.length > 0, `no lettermark: ${e.id}`);
    assert.ok(/^#[0-9A-Fa-f]{6}$/.test(e.glyph.hex), `bad glyph hex: ${e.id}`);
  }
});

test("the 16-element VPC network vocabulary is first-class", () => {
  const vocabulary = [
    "vpc", "subnet", "availability-zone", "internet-gateway", "route-table",
    "security-group", "network-acl", "nat-gateway", "vpn-connection",
    "direct-connect", "application-load-balancer", "transit-gateway",
    "vpn-gateway", "vpc-endpoint-gateway", "vpc-peering",
    "vpc-endpoint-interface",
  ];
  for (const id of vocabulary) {
    assert.ok(ids.has(id), `missing vocabulary element: ${id}`);
  }
});

test("provider-true placement defaults", () => {
  // IGW at VPC level, NAT in public subnets, compute/data in private,
  // managed services outside the VPC.
  assert.equal(catalogEntry("internet-gateway")?.placement, "vpc-scoped");
  assert.equal(catalogEntry("nat-gateway")?.placement, "public-subnet");
  assert.equal(catalogEntry("ec2")?.placement, "private-subnet");
  assert.equal(catalogEntry("rds")?.placement, "private-subnet");
  assert.equal(catalogEntry("s3")?.placement, "outside-cloud");
  assert.equal(catalogEntry("cloudwatch")?.placement, "outside-cloud");
  assert.equal(catalogEntry("transit-gateway")?.placement, "region-scoped");
});

test("managed-by separation: control plane vs customer subnets", () => {
  // EKS is hybrid: worker nodes are customer-managed in private subnets;
  // the AWS-managed control plane is a region-scoped rail (Astra finding,
  // 2026-09-24). The spec-level managed-service gate enforces the split.
  assert.equal(catalogEntry("eks")?.managedBy, "hybrid");
  assert.equal(placementMatches("eks", "region-scoped"), true);
  assert.equal(placementMatches("eks", "private-subnet"), true);
});

test("documented placement nuances resolve", () => {
  assert.equal(placementMatches("application-load-balancer", "public-subnet"), true);
  assert.equal(placementMatches("application-load-balancer", "private-subnet"), true); // internal
  assert.equal(placementMatches("lambda", "region-scoped"), true);
  assert.equal(placementMatches("lambda", "private-subnet"), true); // VPC-attached
  assert.equal(placementMatches("ec2", "public-subnet"), false);
});

test("unknown services are reported, never invented", () => {
  assert.equal(isKnownService("not-a-service"), false);
  assert.equal(catalogEntry("not-a-service"), undefined);
  assert.equal(placementMatches("not-a-service", "private-subnet"), false);
});
