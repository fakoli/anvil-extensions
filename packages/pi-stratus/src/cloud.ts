// Stratus service catalog (T006 carry-over, built early for T001).
// Provider-true placement rules per the AWS network diagram DNA
// (docs/algorithms.md §6): IGW at VPC level, NAT/ALB in public subnets,
// compute/data in private subnets, managed services outside VPC.
// Glyphs are original geometric marks (lettermark + category hex) — no
// trademark reproduction (R009).

export type Provider = "aws" | "gcp" | "azure";

export type Placement =
  | "public-subnet" // internet-facing: ALB, NAT gateway
  | "private-subnet" // customer compute/data: EC2, RDS, EKS nodes
  | "vpc-scoped" // attached to the VPC, not inside a subnet: IGW, TGW, SG
  | "region-scoped" // regional construct or AWS-managed regional service
  | "outside-cloud"; // users, on-prem, the public internet

export type ManagedBy = "provider" | "customer" | "hybrid"; // provider = AWS/GCP/Azure-managed

export type Category =
  | "network"
  | "compute"
  | "database"
  | "storage"
  | "security"
  | "monitoring"
  | "integration"
  | "external";

export interface CatalogEntry {
  /** Stable service catalog id, e.g. "nat-gateway". */
  id: string;
  label: string;
  category: Category;
  /** aws = AWS-managed (control planes, regional services); customer = user-owned. */
  managedBy: ManagedBy;
  /** Provider-true default placement; nuances go in notes. */
  placement: Placement;
  providers: Provider[];
  /** Original geometric mark: lettermark + category hex (R009). */
  glyph: { lettermark: string; hex: string };
  notes?: string;
}

/** Original category hex palette — deliberately not vendor icon colors. */
export const CATEGORY_HEX: Record<Category, string> = {
  network: "#4A90D9",
  compute: "#E07A2F",
  database: "#9B59B6",
  storage: "#2FA36B",
  security: "#C0392B",
  monitoring: "#16A085",
  integration: "#B8860B",
  external: "#6B7280",
};

const g = (lettermark: string, category: Category) => ({
  lettermark,
  hex: CATEGORY_HEX[category],
});

/**
 * The 16-element VPC network vocabulary (cloudviz DNA §6.1) plus core
 * compute/database/storage/security services. AWS-first; GCP/Azure network
 * equivalents included where the concept maps 1:1.
 */
export const CATALOG: readonly CatalogEntry[] = [
  // ---- network vocabulary (the 16 first-class VPC elements) ----
  { id: "vpc", label: "VPC", category: "network", managedBy: "customer", placement: "region-scoped", providers: ["aws", "gcp", "azure"], glyph: g("VPC", "network"), notes: "GCP: VPC network (global); Azure: VNet (regional)." },
  { id: "subnet", label: "Subnet", category: "network", managedBy: "customer", placement: "vpc-scoped", providers: ["aws", "gcp", "azure"], glyph: g("SB", "network"), notes: "Belongs to one VPC and one AZ (AWS); GCP regional subnets; Azure regional, not zone-bound." },
  { id: "availability-zone", label: "Availability Zone", category: "network", managedBy: "provider", placement: "region-scoped", providers: ["aws", "azure"], glyph: g("AZ", "network"), notes: "Not owned by a VPC; multiple VPCs occupy the same AZ." },
  { id: "internet-gateway", label: "Internet Gateway", category: "network", managedBy: "provider", placement: "vpc-scoped", providers: ["aws"], glyph: g("IGW", "network") },
  { id: "egress-only-internet-gateway", label: "Egress-Only Internet Gateway", category: "network", managedBy: "provider", placement: "vpc-scoped", providers: ["aws"], glyph: g("EIGW", "network"), notes: "IPv6-only egress target for ::/0 routes." },
  { id: "route-table", label: "Route Table", category: "network", managedBy: "customer", placement: "vpc-scoped", providers: ["aws", "gcp", "azure"], glyph: g("RT", "network"), notes: "Rendered as a first-class Destination|Target table; determines traffic flow." },
  { id: "security-group", label: "Security Group", category: "security", managedBy: "customer", placement: "vpc-scoped", providers: ["aws", "gcp", "azure"], glyph: g("SG", "security"), notes: "Membership overlay/band — never containment; must allow both IPv4 and IPv6 on dual-stack." },
  { id: "vpc-lattice", label: "VPC Lattice Service Network", category: "network", managedBy: "provider", placement: "region-scoped", providers: ["aws"], glyph: g("VL", "network"), notes: "Region-scoped service network; associates VPCs and services across accounts. Service-to-service traffic uses service-target edges with SigV4/IAM auth." },
  { id: "vpc-lattice-service", label: "VPC Lattice Service", category: "integration", managedBy: "provider", placement: "region-scoped", providers: ["aws"], glyph: g("VLS", "integration"), notes: "A Lattice service behind listener/target groups; associated to a service network." },
  { id: "transit-gateway", label: "Transit Gateway", category: "network", managedBy: "provider", placement: "region-scoped", providers: ["aws"], glyph: g("TGW", "network"), notes: "Regional hub connecting VPC and VPN attachments; inspection VPCs centralize east-west firewalls." },
  { id: "nat-instance", label: "NAT Instance", category: "network", managedBy: "customer", placement: "public-subnet", providers: ["aws"], glyph: g("NI", "network") },
  { id: "vpn-connection", label: "Site-to-Site VPN", category: "network", managedBy: "customer", placement: "vpc-scoped", providers: ["aws", "azure"], glyph: g("VPN", "network") },
  { id: "client-vpn-endpoint", label: "Client VPN Endpoint", category: "network", managedBy: "provider", placement: "vpc-scoped", providers: ["aws"], glyph: g("CVPN", "network") },
  { id: "private-dns", label: "Private Hosted Zone", category: "network", managedBy: "customer", placement: "vpc-scoped", providers: ["aws"], glyph: g("DNS", "network"), notes: "DNS64 synthesizes AAAA from A records for IPv6-only clients." },
  { id: "cloud-map", label: "Cloud Map Namespace", category: "integration", managedBy: "provider", placement: "region-scoped", providers: ["aws"], glyph: g("CM", "integration") },
  { id: "firewall", label: "Network Firewall", category: "security", managedBy: "provider", placement: "public-subnet", providers: ["aws", "azure"], glyph: g("FW", "security"), notes: "AWS Network Firewall endpoints per AZ; centralized inspection VPCs route east-west through TGW." },
  { id: "web-acl", label: "WAF Web ACL", category: "security", managedBy: "provider", placement: "region-scoped", providers: ["aws", "azure"], glyph: g("WAF", "security") },
  { id: "nacl", label: "Network ACL", category: "security", managedBy: "customer", placement: "vpc-scoped", providers: ["aws"], glyph: g("NACL", "security") },
  { id: "network-acl", label: "Network ACL", category: "security", managedBy: "customer", placement: "vpc-scoped", providers: ["aws"], glyph: g("NACL", "security"), notes: "Subnet-level, stateless." },
  { id: "nat-gateway", label: "NAT Gateway", category: "network", managedBy: "customer", placement: "public-subnet", providers: ["aws", "gcp", "azure"], glyph: g("NAT", "network"), notes: "One per AZ for private-subnet IPv4 egress; sends translated packets to the IGW." },
  { id: "nat64", label: "NAT64", category: "network", managedBy: "provider", placement: "public-subnet", providers: ["aws"], glyph: g("N64", "network"), notes: "IPv6→IPv4 translation for IPv4-only destinations; pairs with DNS64 (AAAA synthesis)." },
  { id: "direct-connect", label: "Direct Connect", category: "network", managedBy: "customer", placement: "region-scoped", providers: ["aws"], glyph: g("DX", "network") },
  { id: "application-load-balancer", label: "Application Load Balancer", category: "network", managedBy: "customer", placement: "public-subnet", providers: ["aws"], glyph: g("ALB", "network"), notes: "Internal ALBs sit in private subnets; dual-stack ALBs terminate IPv4+IPv6." },
  { id: "network-load-balancer", label: "Network Load Balancer", category: "network", managedBy: "customer", placement: "public-subnet", providers: ["aws"], glyph: g("NLB", "network"), notes: "Internal NLBs sit in private subnets." },
  { id: "vpn-gateway", label: "Virtual Private Gateway", category: "network", managedBy: "provider", placement: "vpc-scoped", providers: ["aws"], glyph: g("VGW", "network") },
  { id: "vpc-endpoint-gateway", label: "VPC Endpoint (Gateway)", category: "network", managedBy: "customer", placement: "vpc-scoped", providers: ["aws"], glyph: g("GWEP", "network"), notes: "S3/DynamoDB gateway endpoints — private access without internet traversal." },
  { id: "vpc-endpoint-interface", label: "VPC Endpoint (Interface)", category: "network", managedBy: "customer", placement: "private-subnet", providers: ["aws"], glyph: g("IFEP", "network"), notes: "ENIs in private subnets." },
  { id: "vpc-peering", label: "VPC Peering Connection", category: "network", managedBy: "customer", placement: "region-scoped", providers: ["aws", "gcp", "azure"], glyph: g("PEER", "network") },
  { id: "network-firewall", label: "Network Firewall", category: "security", managedBy: "customer", placement: "public-subnet", providers: ["aws"], glyph: g("NFW", "security"), notes: "Endpoints in public subnets of the inspection VPC (centralized) or each VPC (distributed)." },

  // ---- compute ----
  { id: "ec2", label: "EC2 Instance", category: "compute", managedBy: "customer", placement: "private-subnet", providers: ["aws"], glyph: g("EC2", "compute") },
  { id: "asg", label: "Auto Scaling Group", category: "compute", managedBy: "customer", placement: "private-subnet", providers: ["aws", "gcp", "azure"], glyph: g("ASG", "compute"), notes: "Multi-AZ: render linked instances, not one wrapping rectangle." },
  { id: "eks", label: "EKS Cluster", category: "compute", managedBy: "hybrid", placement: "private-subnet", providers: ["aws"], glyph: g("EKS", "compute"), notes: "Control plane AWS-managed (separate rail); worker nodes customer-managed in private subnets. IPv6: node /80 prefix from subnet /64, pods /128 from node /80." },
  { id: "ecs", label: "ECS Service", category: "compute", managedBy: "customer", placement: "private-subnet", providers: ["aws"], glyph: g("ECS", "compute") },
  { id: "lambda", label: "Lambda Function", category: "compute", managedBy: "provider", placement: "region-scoped", providers: ["aws"], glyph: g("λ", "compute"), notes: "VPC-attached functions get ENIs in private subnets." },
  { id: "gke", label: "GKE Cluster", category: "compute", managedBy: "hybrid", placement: "private-subnet", providers: ["gcp"], glyph: g("GKE", "compute") },
  { id: "aks", label: "AKS Cluster", category: "compute", managedBy: "hybrid", placement: "private-subnet", providers: ["azure"], glyph: g("AKS", "compute") },

  // ---- database ----
  { id: "rds", label: "RDS Database", category: "database", managedBy: "customer", placement: "private-subnet", providers: ["aws"], glyph: g("RDS", "database"), notes: "Multi-AZ standby + read replicas: linked instances across AZ slices." },
  { id: "dynamodb", label: "DynamoDB", category: "database", managedBy: "provider", placement: "region-scoped", providers: ["aws"], glyph: g("DDB", "database") },
  { id: "elasticache", label: "ElastiCache", category: "database", managedBy: "customer", placement: "private-subnet", providers: ["aws"], glyph: g("ECa", "database") },
  { id: "cloud-sql", label: "Cloud SQL", category: "database", managedBy: "customer", placement: "private-subnet", providers: ["gcp"], glyph: g("CSQL", "database") },
  { id: "azure-sql", label: "Azure SQL Database", category: "database", managedBy: "customer", placement: "private-subnet", providers: ["azure"], glyph: g("SQL", "database") },

  // ---- storage ----
  { id: "s3", label: "S3", category: "storage", managedBy: "provider", placement: "outside-cloud", providers: ["aws"], glyph: g("S3", "storage"), notes: "Regional public service; access via gateway endpoint without internet traversal." },
  { id: "efs", label: "EFS", category: "storage", managedBy: "provider", placement: "private-subnet", providers: ["aws"], glyph: g("EFS", "storage"), notes: "Mount targets in private subnets." },
  { id: "gcs", label: "Cloud Storage", category: "storage", managedBy: "provider", placement: "outside-cloud", providers: ["gcp"], glyph: g("GCS", "storage") },
  { id: "azure-blob", label: "Blob Storage", category: "storage", managedBy: "provider", placement: "outside-cloud", providers: ["azure"], glyph: g("BLOB", "storage") },

  // ---- security / monitoring / integration (managed, outside VPC) ----
  { id: "iam", label: "IAM", category: "security", managedBy: "provider", placement: "outside-cloud", providers: ["aws", "gcp", "azure"], glyph: g("IAM", "security") },
  { id: "secrets-manager", label: "Secrets Manager", category: "security", managedBy: "provider", placement: "region-scoped", providers: ["aws"], glyph: g("SM", "security") },
  { id: "kms", label: "KMS", category: "security", managedBy: "provider", placement: "region-scoped", providers: ["aws", "gcp", "azure"], glyph: g("KMS", "security") },
  { id: "cloudwatch", label: "CloudWatch", category: "monitoring", managedBy: "provider", placement: "outside-cloud", providers: ["aws"], glyph: g("CW", "monitoring"), notes: "Auxiliary: dashed unfilled box, no flow edges." },
  { id: "route53", label: "Route 53", category: "network", managedBy: "provider", placement: "outside-cloud", providers: ["aws"], glyph: g("R53", "network") },
  { id: "cloudfront", label: "CloudFront", category: "integration", managedBy: "provider", placement: "outside-cloud", providers: ["aws"], glyph: g("CF", "integration") },
  { id: "api-gateway", label: "API Gateway", category: "integration", managedBy: "provider", placement: "region-scoped", providers: ["aws"], glyph: g("AGW", "integration") },
  { id: "sqs", label: "SQS", category: "integration", managedBy: "provider", placement: "region-scoped", providers: ["aws"], glyph: g("SQS", "integration") },
  { id: "sns", label: "SNS", category: "integration", managedBy: "provider", placement: "region-scoped", providers: ["aws"], glyph: g("SNS", "integration") },

  // ---- externals ----
  { id: "client", label: "Clients", category: "external", managedBy: "customer", placement: "outside-cloud", providers: ["aws", "gcp", "azure"], glyph: g("USR", "external") },
  { id: "internet", label: "Internet", category: "external", managedBy: "customer", placement: "outside-cloud", providers: ["aws", "gcp", "azure"], glyph: g("INET", "external") },
  { id: "on-prem", label: "On-Premises", category: "external", managedBy: "customer", placement: "outside-cloud", providers: ["aws", "gcp", "azure"], glyph: g("DC", "external") },
];

const byId = new Map(CATALOG.map((e) => [e.id, e]));

/** Resolve a catalog entry by id, or undefined when unknown. */
export function catalogEntry(id: string): CatalogEntry | undefined {
  return byId.get(id);
}

/** True when the id exists in the catalog. */
export function isKnownService(id: string): boolean {
  return byId.has(id);
}

/**
 * Provider-true placement check: does `placement` satisfy the entry's
 * default placement? Nuances (internal ALB, VPC-attached Lambda) are
 * documented in notes and allowed by the validator's provider-scope gate.
 */
export function placementMatches(id: string, placement: Placement): boolean {
  const e = byId.get(id);
  if (!e) return false;
  if (e.placement === placement) return true;
  // Documented nuances:
  if (id === "application-load-balancer" || id === "network-load-balancer") {
    return placement === "private-subnet"; // internal LBs
  }
  if (id === "lambda") return placement === "private-subnet"; // VPC-attached
  if (id === "eks") return placement === "region-scoped"; // managed control plane
  if (id === "firewall") return placement === "vpc-scoped"; // Azure Firewall is vnet-scoped
  if (id === "transit-gateway") return placement === "vpc-scoped"; // TGW attachments
  return false;
}
