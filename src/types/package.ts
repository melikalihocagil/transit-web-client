export type PackageScope = 'SINGLE_ROUTE' | 'MULTI_ROUTE' | 'NETWORK_WIDE';
export type PackageStatus = 'DRAFT' | 'PUBLISHED' | 'ROLLED_BACK';

export interface RevisionPackage {
  packageId: string;
  packageName: string;
  scopeType: PackageScope;
  status: PackageStatus;
  ukomeDecisionNo?: string;
  description?: string;
  createdBy: string;
  publishedBy?: string | null;
  createdAt: string;
  publishedAt?: string | null;
  rolledBackAt?: string | null;
}

export interface OperatorProfile {
  id: string;
  name: string;
  role: 'PLANNER' | 'ADMIN' | 'DIRECTOR';
  title: string;
}
