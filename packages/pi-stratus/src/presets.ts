// Provider-specific progressive-disclosure fixtures (T007).
// Ladder per the AWS network diagram DNA (docs/algorithms.md §6.2):
// simple VPC → + ALB/targets → three-tier → + gateway endpoint → VPN → TGW.
// Every preset is a complete, truth-tested snapshot.

import type { StratusSpec } from "./schema.ts";

export interface PresetInfo {
  id: string;
  label: string;
  ladderStep: number;
  provider: "aws" | "gcp" | "azure";
}

function baseSpec(title: string): Omit<StratusSpec, "provider" | "cloud"> {
  return {
    schemaVersion: 1,
    title,
    geography: [{ id: "geo-us-east-1", label: "US East (N. Virginia)", code: "us-east-1", zones: ["us-east-1a", "us-east-1b"] }],
    externals: [{ id: "users", label: "Users", kind: "external", actorType: "users" }],
    policies: [],
    frames: [],
    planes: [{ id: "plane-web", kind: "traffic-plane" as never, label: "web", family: "dual", role: "ingress" } as never],
    edges: [],
    routingFacts: [],
    routeCards: [],
    views: [{ id: "view-overview", label: "Overview", kind: "view" as never, focusIds: ["vpc-main"], detail: "overview", omittedContext: [] } as never],
    presentation: { profile: "normalized", spacing: "comfortable", flow: "top-down" },
  } as unknown as Omit<StratusSpec, "provider" | "cloud">;
}

/** Ladder step 1: simple VPC — 2 AZs, public/private subnet pairs, IGW, route tables. */
export function simpleVpcSpec(): StratusSpec {
  return {
    ...baseSpec("Simple VPC — two AZs, public/private pairs, IGW"),
    provider: "aws",
    cloud: {
      kind: "aws-cloud", id: "aws-cloud", label: "AWS Cloud", resources: [],
      regions: [{
        kind: "aws-region", id: "region-use1", label: "US East", regionId: "geo-us-east-1", resources: [],
        vpcs: [{
          kind: "aws-vpc", id: "vpc-main", label: "Amazon VPC",
          resources: [{ kind: "resource", id: "igw-main", label: "Internet Gateway", service: "internet-gateway", placement: { kind: "network" }, managedBy: "provider" }],
          cidrs: { status: "known", value: [{ family: "ipv4", value: "10.0.0.0/16" }] },
          azs: [
            {
              kind: "aws-az-slice", id: "az-1", label: "AZ 1", zone: { regionId: "geo-us-east-1", zone: "us-east-1a" }, resources: [],
              subnets: [
                { kind: "subnet", id: "subnet-public-1", label: "public subnet A", resources: [], tier: "ingress", classification: "public", cidrs: { status: "known", value: [{ family: "ipv4", value: "10.0.1.0/24" }] } },
                { kind: "subnet", id: "subnet-private-1", label: "private subnet A", resources: [], tier: "compute", classification: "private", cidrs: { status: "known", value: [{ family: "ipv4", value: "10.0.11.0/24" }] } },
              ],
            },
            {
              kind: "aws-az-slice", id: "az-2", label: "AZ 2", zone: { regionId: "geo-us-east-1", zone: "us-east-1b" }, resources: [],
              subnets: [
                { kind: "subnet", id: "subnet-public-2", label: "public subnet B", resources: [], tier: "ingress", classification: "public", cidrs: { status: "known", value: [{ family: "ipv4", value: "10.0.2.0/24" }] } },
                { kind: "subnet", id: "subnet-private-2", label: "private subnet B", resources: [], tier: "compute", classification: "private", cidrs: { status: "known", value: [{ family: "ipv4", value: "10.0.12.0/24" }] } },
              ],
            },
          ],
        }],
      }],
    },
    edges: [],
    routingFacts: [
      {
        kind: "route-table", id: "rt-public", label: "public subnets route table", tableType: "vpc", ownerScopeId: "vpc-main",
        appliesTo: [{ kind: "subnet", subnetId: "subnet-public-1" }, { kind: "subnet", subnetId: "subnet-public-2" }],
        completeness: "complete-for-declared-flow",
        rows: [
          { id: "row-local", label: "local", destination: { kind: "cidr", cidr: { family: "ipv4", value: "10.0.0.0/16" } }, target: { status: "known", value: { kind: "local" } }, origin: "system" },
          { id: "row-igw", label: "0.0.0.0/0 → igw-main", destination: { kind: "cidr", cidr: { family: "ipv4", value: "0.0.0.0/0" } }, target: { status: "known", value: { kind: "resource", resourceId: "igw-main" } }, origin: "static" },
        ],
      },
    ],
    routeCards: [{ id: "card-rt-public", label: "public route table", tableId: "rt-public", rail: "left" }],
  } as unknown as StratusSpec;
}

/** Ladder step 3: three-tier — external ALB, app ASG, RDS Multi-AZ, NAT per AZ. */
export function threeTierSpec(): StratusSpec {
  return {
    ...baseSpec("Three-tier VPC — ALB, app ASG, RDS Multi-AZ"),
    provider: "aws",
    cloud: {
      kind: "aws-cloud", id: "aws-cloud", label: "AWS Cloud", resources: [],
      regions: [{
        kind: "aws-region", id: "region-use1", label: "US East", regionId: "geo-us-east-1", resources: [],
        vpcs: [{
          kind: "aws-vpc", id: "vpc-main", label: "Amazon VPC", resources: [
            { kind: "resource", id: "igw-main", label: "Internet Gateway", service: "aws.internet-gateway", placement: { kind: "network", networkId: "vpc-main" }, tier: "ingress" },
            {
              kind: "resource", id: "alb-main", label: "ALB", service: "aws.application-load-balancer",
              placement: {
                kind: "multi-subnet", deployment: "distributed",
                attachments: [
                  { id: "att-alb-1", label: "ALB A", subnetId: "subnet-public-1", role: "member" },
                  { id: "att-alb-2", label: "ALB B", subnetId: "subnet-public-2", role: "member" },
                ],
              },
              tier: "load-balancer", exposure: "internet-facing",
            },
            {
              kind: "resource", id: "nat-1", label: "NAT Gateway AZ1", service: "aws.nat-gateway",
              placement: { kind: "single-subnet", attachment: { id: "att-nat-1", label: "NAT A", subnetId: "subnet-public-1", role: "member" } },
              tier: "ingress", exposure: "internal",
            },
            {
              kind: "resource", id: "asg-app", label: "App ASG", service: "aws.asg",
              placement: {
                kind: "multi-subnet", deployment: "distributed",
                attachments: [
                  { id: "att-asg-1", label: "app A", subnetId: "subnet-private-1", role: "member" },
                  { id: "att-asg-2", label: "app B", subnetId: "subnet-private-2", role: "member" },
                ],
              },
              tier: "compute",
            },
            {
              kind: "resource", id: "rds-main", label: "RDS Multi-AZ", service: "aws.rds",
              placement: {
                kind: "multi-subnet", deployment: "active-standby",
                attachments: [
                  { id: "att-rds-1", label: "RDS primary", subnetId: "subnet-private-1", role: "primary" },
                  { id: "att-rds-2", label: "RDS standby", subnetId: "subnet-private-2", role: "standby" },
                ],
              },
              tier: "data",
            },
          ],
          cidrs: { status: "known", value: [{ family: "ipv4", value: "10.0.0.0/16" }] },
          azs: [
            {
              kind: "aws-az-slice", id: "az-1", label: "AZ 1", zone: { regionId: "geo-us-east-1", zone: "us-east-1a" }, resources: [],
              subnets: [
                { kind: "subnet", id: "subnet-public-1", label: "public subnet A", resources: [], tier: "ingress", classification: "public", cidrs: { status: "known", value: [{ family: "ipv4", value: "10.0.1.0/24" }] } },
                { kind: "subnet", id: "subnet-private-1", label: "private subnet A", resources: [], tier: "compute", classification: "private", cidrs: { status: "known", value: [{ family: "ipv4", value: "10.0.11.0/24" }] } },
              ],
            },
            {
              kind: "aws-az-slice", id: "az-2", label: "AZ 2", zone: { regionId: "geo-us-east-1", zone: "us-east-1b" }, resources: [],
              subnets: [
                { kind: "subnet", id: "subnet-public-2", label: "public subnet B", resources: [], tier: "ingress", classification: "public", cidrs: { status: "known", value: [{ family: "ipv4", value: "10.0.2.0/24" }] } },
                { kind: "subnet", id: "subnet-private-2", label: "private subnet B", resources: [], tier: "compute", classification: "private", cidrs: { status: "known", value: [{ family: "ipv4", value: "10.0.12.0/24" }] } },
              ],
            },
          ],
        }],
      }],
    },
    externals: [{ id: "users", label: "Users", kind: "external", actorType: "users" }],
    planes: [{ id: "plane-web", kind: "traffic-plane" as never, label: "web", family: "dual", role: "ingress" } as never],
    edges: [
      { kind: "request", id: "edge-users-alb", label: "users-alb", semanticLabel: { text: "HTTPS :443" }, variant: "emphasis", from: { kind: "external", actorId: "users" }, to: { kind: "resource", resourceId: "alb-main", attachmentId: "att-alb-1" }, planeId: "plane-web", protocol: { status: "known", value: { transport: "tcp", ports: [443], application: "HTTPS" } }, direction: "forward", routing: { status: "unknown", reason: "listener routing declared at the ALB" }, step: 1 },
      { kind: "service-target", id: "edge-alb-asg", label: "alb-asg", semanticLabel: { text: "forward to targets" }, variant: "normal", from: { kind: "resource", resourceId: "alb-main", attachmentId: "att-alb-1" }, to: { kind: "resource", resourceId: "asg-app", attachmentId: "att-asg-1" }, planeId: "plane-web", targetGroupId: "tg-app", routing: { status: "unknown", reason: "target group declared" }, step: 2 },
      { kind: "request", id: "edge-asg-rds", label: "asg-rds", semanticLabel: { text: "SQL :5432" }, variant: "normal", from: { kind: "resource", resourceId: "asg-app", attachmentId: "att-asg-1" }, to: { kind: "resource", resourceId: "rds-main", attachmentId: "att-rds-1" }, planeId: "plane-web", protocol: { status: "known", value: { transport: "tcp", ports: [5432], application: "PostgreSQL" } }, direction: "forward", routing: { status: "unknown", reason: "in-subnet routing" }, step: 3 },
      { kind: "request", id: "edge-asg-nat", label: "asg-nat", semanticLabel: { text: "IPv4 egress" }, variant: "async", from: { kind: "resource", resourceId: "asg-app", attachmentId: "att-asg-1" }, to: { kind: "resource", resourceId: "nat-1", attachmentId: "att-nat-1" }, planeId: "plane-web", protocol: { status: "known", value: { transport: "tcp" } }, direction: "forward", routing: { status: "unknown", reason: "0.0.0.0/0 → NAT in private route table" } },
    ],
    routingFacts: [
      { kind: "listener", id: "listener-443", label: "listener", resourceId: "alb-main", port: 443, targetGroupId: "tg-app" },
      { kind: "target-group", id: "tg-app", label: "app targets", serviceId: "asg-app", targetResourceIds: ["asg-app"] },
      {
        kind: "route-table", id: "rt-private", label: "private route table", tableType: "vpc", ownerScopeId: "vpc-main",
        appliesTo: [{ kind: "subnet", subnetId: "subnet-private-1" }, { kind: "subnet", subnetId: "subnet-private-2" }],
        completeness: "complete-for-declared-flow",
        rows: [
          { id: "row-local", label: "local", destination: { kind: "cidr", cidr: { family: "ipv4", value: "10.0.0.0/16" } }, target: { status: "known", value: { kind: "local" } }, origin: "system" },
          { id: "row-nat", label: "nat", destination: { kind: "cidr", cidr: { family: "ipv4", value: "0.0.0.0/0" } }, target: { status: "known", value: { kind: "resource", resourceId: "nat-1" } }, origin: "static" },
        ],
      },
    ],
    routeCards: [{ id: "card-rt-private", label: "private route table", tableId: "rt-private", rail: "left" }],
  } as unknown as StratusSpec;
}

/** Ladder step 2: simple VPC + ALB + EC2 targets. */
export function albTargetsSpec(): StratusSpec {
  const spec = JSON.parse(JSON.stringify(simpleVpcSpec())) as StratusSpec;
  const cloud = spec.cloud as unknown as {
    regions: { vpcs: { azs: { subnets: { id: string; resources: { id?: string; kind?: string; label: string; service: string; managedBy?: string; placement: { kind: string; attachment?: { id: string; subnetId: string; zone: { regionId: string; zone: string } } } }[] }[] }[] }[] }[];
  };
  const az1 = cloud.regions[0]?.vpcs[0]?.azs[0];
  const az2 = cloud.regions[0]?.vpcs[0]?.azs[1];
  if (!az1 || !az2) throw new Error("alb-targets fixture: missing AZ slices");
  az1.subnets[0]?.resources.push({
    kind: "resource", id: "alb-1", label: "Application Load Balancer", service: "application-load-balancer", managedBy: "provider",
    placement: { kind: "single-subnet", attachment: { id: "att-alb-1", subnetId: az1.subnets[0]?.id ?? "subnet-public-1", zone: { regionId: "geo-us-east-1", zone: "us-east-1a" } } },
  });
  az2.subnets[1]?.resources.push({
    kind: "resource", id: "ec2-1", label: "EC2 target", service: "ec2", managedBy: "provider",
    placement: { kind: "single-subnet", attachment: { id: "att-ec2-1", subnetId: az2.subnets[1]?.id ?? "subnet-private-2", zone: { regionId: "geo-us-east-1", zone: "us-east-1b" } } },
  });
  (spec as unknown as { edges: { id: string; kind: string; label: string; semanticLabel: { text: string }; from: { kind: string; resourceId: string }; to: { kind: string; resourceId: string }; variant: string; routing: { status: string; value: string[] } }[] }).edges.push({
    id: "edge-alb-ec2", kind: "service-target", label: "alb-ec2", semanticLabel: { text: "HTTP targets" }, from: { kind: "resource", resourceId: "alb-1" }, to: { kind: "resource", resourceId: "ec2-1" }, variant: "sync",
    routing: { status: "known", value: ["rt-public"] },
  });
  return spec;
}

/** Ladder step 4: three-tier + VPC gateway endpoint (S3). */
export function gatewayEndpointSpec(): StratusSpec {
  const spec = JSON.parse(JSON.stringify(threeTierSpec())) as StratusSpec & { routingFacts: { kind: string; id: string; label: string; tableType: string; ownerScopeId: string; appliesTo: { kind: string; subnetId: string }[]; completeness: string; rows: { id: string; label: string; destination: { kind: string; cidr: { family: string; value: string } }; target: { status: string; value: { kind: string; resourceId?: string; gatewayEndpointId?: string } }; origin: string }[] }[] };
  const cloud = spec.cloud as unknown as { regions: { vpcs: { resources: { id: string; label: string; service: string; placement: { kind: string } }[] }[] }[] };
  cloud.regions[0]?.vpcs[0]?.resources.push({ id: "vpce-s3", label: "S3 Gateway Endpoint", service: "vpc-endpoint-gateway", placement: { kind: "network" } });
  spec.routingFacts.push({
    kind: "route-table", id: "rt-endpoint", label: "S3 endpoint route", tableType: "vpc", ownerScopeId: "vpc-main",
    appliesTo: [], completeness: "complete-for-declared-flow",
    rows: [{ id: "row-s3", label: "pl.s3.amazonaws.com → vpce-s3", destination: { kind: "cidr", cidr: { family: "ipv4", value: "0.0.0.0/0" } }, target: { status: "known", value: { kind: "resource", resourceId: "vpce-s3" } }, origin: "static" }],
  });
  return spec;
}

/** Ladder step 5: three-tier + Site-to-Site VPN attachment. */
export function siteToSiteVpnSpec(): StratusSpec {
  const spec = JSON.parse(JSON.stringify(gatewayEndpointSpec())) as StratusSpec & { routingFacts: { kind: string; id: string; label: string; tableType: string; ownerScopeId: string; appliesTo: { kind: string; subnetId: string }[]; completeness: string; rows: { id: string; label: string; destination: { kind: string; cidr: { family: string; value: string } }; target: { status: string; value: { kind: string; resourceId?: string } }; origin: string }[] }[] };
  const cloud = spec.cloud as unknown as { regions: { resources: { id: string; label: string; service: string; placement: { kind: string; regionId?: string } }[]; vpcs: { resources: { id: string; label: string; service: string; placement: { kind: string; networkId?: string } }[] }[] }[] };
  cloud.regions[0]?.vpcs[0]?.resources.push({ id: "vgw-main", label: "VPN Gateway", service: "vpn-gateway", placement: { kind: "network", networkId: "vpc-main" } });
  spec.routingFacts.push({
    kind: "route-table", id: "rt-vpn", label: "VPN propagation route", tableType: "vpc", ownerScopeId: "vpc-main",
    appliesTo: [], completeness: "complete-for-declared-flow",
    rows: [{ id: "row-vpn", label: "192.168.0.0/16 → vgw-main", destination: { kind: "cidr", cidr: { family: "ipv4", value: "192.168.0.0/16" } }, target: { status: "known", value: { kind: "resource", resourceId: "vgw-main" } }, origin: "propagated" }],
  });
  return spec;
}

/** Ladder step 6: Transit Gateway hub with two spoke VPC attachments. */
export function transitGatewaySpec(): StratusSpec {
  const spec = JSON.parse(JSON.stringify(siteToSiteVpnSpec())) as StratusSpec & { routingFacts: { kind: string; id: string; label: string; tableType: string; ownerScopeId: string; appliesTo: { kind: string; subnetId: string }[]; completeness: string; rows: { id: string; label: string; destination: { kind: string; cidr: { family: string; value: string } }; target: { status: string; value: { kind: string; resourceId?: string } }; origin: string }[] }[] };
  const cloud = spec.cloud as unknown as { regions: { resources: { id: string; label: string; service: string; placement: { kind: string; regionId?: string } }[]; vpcs: { id: string; label: string; resources: { id: string; label: string; service: string; placement: { kind: string; networkId?: string } }[] }[] }[] };
  cloud.regions[0]?.resources.push({ id: "tgw-hub", label: "Transit Gateway", service: "transit-gateway", placement: { kind: "region", regionId: "region-use1" } });
  // Second spoke VPC attaches to the hub.
  const spoke: { id: string; label: string; azs: { id: string; label: string; zone: { regionId: string; zone: string }; resources: { id: string; label: string; service: string; placement: { kind: string; networkId?: string } }[]; subnets: { id: string; label: string; classification: string; tier: string; resources: { id: string; label: string; service: string; placement: { kind: string; networkId?: string } }[]; cidrs: { status: string; value: { family: string; value: string }[] } }[] }[]; cidrs: { status: string; value: { family: string; value: string }[] }; resources: { id: string; label: string; service: string; placement: { kind: string; networkId?: string } }[] } = {
    id: "vpc-spoke", label: "Spoke VPC",
    cidrs: { status: "known", value: [{ family: "ipv4", value: "10.2.0.0/16" }] },
    azs: [{
      id: "az-spoke-1", label: "AZ us-east-1a", zone: { regionId: "geo-us-east-1", zone: "us-east-1a" },
      resources: [{ id: "tgw-attach-spoke", label: "TGW Attachment", service: "transit-gateway", placement: { kind: "network", networkId: "vpc-spoke" } }],
      subnets: [{ id: "subnet-spoke-1", label: "subnet spoke-1", classification: "private", tier: "compute", resources: [], cidrs: { status: "known", value: [{ family: "ipv4", value: "10.2.1.0/24" }] } }],
    }],
    resources: [],
  };
  cloud.regions[0]?.vpcs.push(spoke);
  spec.routingFacts.push({
    kind: "route-table", id: "rt-tgw", label: "TGW hub route", tableType: "transit-gateway", ownerScopeId: "tgw-hub",
    appliesTo: [], completeness: "complete-for-declared-flow",
    rows: [{ id: "row-tgw", label: "10.0.0.0/8 → tgw-hub", destination: { kind: "cidr", cidr: { family: "ipv4", value: "10.0.0.0/8" } }, target: { status: "known", value: { kind: "resource", resourceId: "tgw-hub" } }, origin: "propagated" }],
  });
  return spec;
}

/** GCP variant: VPC network with regional subnets (no AZ slices). */
export function gcpNetworkSpec(): StratusSpec {
  return {
    ...baseSpec("GCP VPC network — regional subnets"),
    provider: "gcp",
    cloud: {
      kind: "gcp-cloud", id: "gcp-cloud", label: "Google Cloud", resources: [],
      networks: [{
        kind: "gcp-network", id: "vpc-main", label: "VPC network", regionId: "geo-us-east-1", resources: [],
        regions: [{
          kind: "gcp-network-region", id: "region-use1", label: "us-east1", regionId: "geo-us-east-1", resources: [],
          subnets: [
            { kind: "subnet", id: "subnet-use1-01", label: "subnet us-east1-01", resources: [], tier: "ingress", classification: "public", cidrs: { status: "known", value: [{ family: "ipv4", value: "10.1.0.0/24" }] } },
            { kind: "subnet", id: "subnet-use1-02", label: "subnet us-east1-02", resources: [], tier: "compute", classification: "private", cidrs: { status: "known", value: [{ family: "ipv4", value: "10.1.1.0/24" }] } },
          ],
        }],
      }],
      regions: [],
    },
    edges: [],
    routingFacts: [],
    routeCards: [],
  } as unknown as StratusSpec;
}

/** Azure variant: VNet with subnets (no AZ slices). */
export function azureVnetSpec(): StratusSpec {
  return {
    ...baseSpec("Azure VNet — regional subnets"),
    provider: "azure",
    cloud: {
      kind: "azure-cloud", id: "azure-cloud", label: "Azure", resources: [],
      regions: [{
        kind: "azure-region", id: "region-use1", label: "East US", regionId: "geo-us-east-1", resources: [],
        vpcs: [{
          kind: "azure-vnet", id: "vnet-main", label: "VNet", resources: [],
          cidrs: { status: "known", value: [{ family: "ipv4", value: "10.2.0.0/16" }] },
          subnets: [
            { kind: "subnet", id: "snet-app-1", label: "app subnet", resources: [], tier: "compute", classification: "private", cidrs: { status: "known", value: [{ family: "ipv4", value: "10.2.1.0/24" }] } },
            { kind: "subnet", id: "snet-data-1", label: "data subnet", resources: [], tier: "data", classification: "private", cidrs: { status: "known", value: [{ family: "ipv4", value: "10.2.2.0/24" }] } },
          ],
        }],
      }],
    },
    edges: [],
    routingFacts: [],
    routeCards: [],
  } as unknown as StratusSpec;
}

const PRESETS: readonly { preset: PresetInfo; build: () => StratusSpec }[] = [
  { preset: { id: "simple-vpc", label: "Simple VPC (ladder step 1)", ladderStep: 1, provider: "aws" }, build: simpleVpcSpec },
  { preset: { id: "alb-targets", label: "Simple VPC + ALB + EC2 targets (ladder step 2)", ladderStep: 2, provider: "aws" }, build: albTargetsSpec },
  { preset: { id: "three-tier", label: "Three-tier VPC (ladder step 3)", ladderStep: 3, provider: "aws" }, build: threeTierSpec },
  { preset: { id: "gateway-endpoint", label: "Three-tier + S3 gateway endpoint (ladder step 4)", ladderStep: 4, provider: "aws" }, build: gatewayEndpointSpec },
  { preset: { id: "site-to-site-vpn", label: "Three-tier + Site-to-Site VPN (ladder step 5)", ladderStep: 5, provider: "aws" }, build: siteToSiteVpnSpec },
  { preset: { id: "transit-gateway", label: "Transit Gateway hub/spoke (ladder step 6)", ladderStep: 6, provider: "aws" }, build: transitGatewaySpec },
  { preset: { id: "gcp-network", label: "GCP VPC network (provider variant)", ladderStep: 7, provider: "gcp" }, build: gcpNetworkSpec },
  { preset: { id: "azure-vnet", label: "Azure VNet (provider variant)", ladderStep: 8, provider: "azure" }, build: azureVnetSpec },
];

export function listPresets(): readonly PresetInfo[] {
  return PRESETS.map((p) => p.preset);
}

export function getPreset(id: string): StratusSpec | undefined {
  const found = PRESETS.find((p) => p.preset.id === id);
  return found ? found.build() : undefined;
}
