export class AuthUser {
  id!: string;
  tenantId!: string;
  email!: string;
  fullName!: string;
  permissions!: string[];
  propertyIds!: string[];
  roles!: string[];
}
