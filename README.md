# Nuxt SaaS Starter

A production-ready, full-stack SaaS starter template built with Nuxt 4, featuring multi-tenant organizations, teams, role-based access control, authentication, file management, and more. Built using **vertical slice architecture** for maintainability and scalability.

## Features

- **Authentication System** - Complete auth flow with sign up, sign in, password reset, email verification, and session management
- **Anonymous Authentication** - Auto-session creation on first visit with seamless upgrade-to-credentials flow
- **Multi-Tenant Organizations** - Create and manage organizations with unique slugs and member management
- **Team Management** - Organize members into teams within organizations
- **Role-Based Access Control (RBAC)** - Polymorphic roles supporting global, organization, and team scopes with 27+ permissions
- **Invitation System** - Invite users to organizations via email with token-based acceptance
- **Admin Impersonation** - Super admins can impersonate users for debugging and support
- **User Profile Management** - Update profile, change password, and email change workflow
- **Admin Dashboard** - Manage all organizations, users, teams, and view platform statistics
- **File Management** - Pluggable file storage with local and S3 providers, entity-based file associations
- **Image Processing** - Server-side image variant generation with Sharp (multi-size avatars in WebP)
- **Avatar Cropping** - Client-side circular cropping with vue-advanced-cropper and multi-size variant storage
- **Event Bus** - Event-driven architecture for loose coupling between features
- **Email System** - Pluggable email providers with template support (LiquidJS)
- **Scheduled Tasks** - Automated cleanup of expired tokens via Nitro scheduled tasks

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Nuxt 4.3.0 (Vue 3) |
| **UI** | Nuxt UI 4 + Tailwind CSS |
| **Database** | PostgreSQL + Drizzle ORM |
| **State** | Pinia + Pinia Colada (server-state caching) |
| **Validation** | Zod v4 |
| **Image Processing** | Sharp + vue-advanced-cropper |
| **Email** | Nodemailer + LiquidJS templates |
| **SEO** | @nuxtjs/seo + nuxt-og-image |
| **Testing** | Vitest |
| **Package Manager** | pnpm 10.23.0 |
| **Node** | 22+ |

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10.23.0+
- Docker (for PostgreSQL)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd nuxt-drizzle

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start PostgreSQL
pnpm docker:up

# Push database schema
pnpm db:push

# Start development server
pnpm dev
```

The application will be available at `http://localhost:3000`.

## Commands

```bash
# Development
pnpm dev                    # Start dev server (localhost:3000)
pnpm lint                   # Run ESLint
pnpm lint:fix               # Fix lint issues
pnpm typecheck              # TypeScript checking

# Build
pnpm build                  # Production build
pnpm preview                # Preview production build

# Database (PostgreSQL via Docker)
pnpm docker:up              # Start PostgreSQL container
pnpm docker:clean           # Clean/rebuild containers
pnpm db:push                # Push schema to database
pnpm db:generate            # Generate migrations
pnpm db:studio              # Open Drizzle Studio UI

# Testing
pnpm test                   # Run tests in watch mode
pnpm test:run               # Run tests once
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Site Configuration
NUXT_SITE_NAME="Your App Name"
NUXT_SITE_ENV="development"
NUXT_PUBLIC_SITE_URL="http://localhost:3000"

# Database (PostgreSQL)
NUXT_DATABASE_HOST=localhost
NUXT_DATABASE_PORT=5432
NUXT_DATABASE_USER=postgres
NUXT_DATABASE_PASSWORD=postgres
NUXT_DATABASE_NAME=nuxt-starter

# Authentication
NUXT_AUTH_SECRET=<generate-a-random-secret>

# Email Provider (console|smtp)
NUXT_EMAIL_PROVIDER=console

# SMTP Settings (when using smtp provider)
NUXT_SMTP_HOST=smtp.example.com
NUXT_SMTP_PORT=587
NUXT_SMTP_USER=user@example.com
NUXT_SMTP_PASS=password
NUXT_SMTP_FROM=noreply@example.com

# Storage Configuration
NUXT_STORAGE_PROVIDER=local            # local|s3
NUXT_STORAGE_LOCAL_PATH=./storage/uploads
NUXT_STORAGE_MAX_FILE_SIZE=5242880     # 5MB
NUXT_STORAGE_ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp,image/gif

# S3 Settings (when using s3 provider)
NUXT_S3_BUCKET=your-bucket
NUXT_S3_REGION=us-east-1
NUXT_S3_ENDPOINT=https://s3.amazonaws.com
NUXT_S3_ACCESS_KEY_ID=your-key
NUXT_S3_SECRET_ACCESS_KEY=your-secret
```

## Architecture

This project follows **vertical slice architecture** - features are organized as self-contained slices rather than horizontal layers.

### Directory Structure

```
├── app/                          # Nuxt client-side application
│   ├── features/                 # Feature slices
│   │   ├── auth/                 # Authentication feature
│   │   ├── profile/              # User profile management
│   │   ├── organisations/        # Organization management
│   │   ├── organisation-members/ # Member management
│   │   ├── organisation-invitations/ # Invitation handling
│   │   ├── permissions/          # Client-side permission checking
│   │   ├── files/                # File upload, deletion, queries
│   │   └── admin/                # Admin dashboard & user management
│   ├── components/               # Shared global components (App-prefixed)
│   ├── layouts/                  # Page layouts (default, auth, admin)
│   ├── pages/                    # File-based routing
│   └── utils/                    # Client utilities
│
├── server/                       # Nitro backend
│   ├── features/                 # Feature services
│   │   ├── auth/                 # Auth service, tokens, sessions
│   │   ├── email/                # Email service, providers, templates
│   │   ├── admin/                # Admin impersonation
│   │   ├── organisations/        # Organization CRUD
│   │   ├── organisation-invitations/ # Invitation service
│   │   ├── organisation-members/ # Member management
│   │   ├── profile/              # Profile service
│   │   ├── rbac/                 # Role-based access control
│   │   └── files/                # File storage, image processing
│   ├── database/
│   │   ├── schema/               # Drizzle ORM schemas
│   │   └── migrations/           # Generated migrations
│   ├── infrastructure/
│   │   ├── database/             # Database client, ItemService
│   │   └── events/               # Event bus implementation
│   ├── middleware/               # Auth middleware
│   ├── api/                      # API routes (thin, delegate to services)
│   └── utils/                    # Server utilities, DI container
│
└── shared/                       # Cross-cutting types and utilities
```

### Feature Slice Structure

Each feature slice contains:

```
feature/
├── api/                # API client wrappers & query keys
├── composables/        # Vue 3 composables (queries + mutations)
├── components/         # Vue SFC components
├── types/              # TypeScript interfaces
└── index.ts            # Public exports
```

## Feature Documentation

### Authentication

Complete authentication system with session-based auth using httpOnly cookies.

**Capabilities:**
- User registration with email/password
- Email verification (24-hour token expiry)
- Sign in with "Remember me" option (30 days vs 1 day)
- Password reset flow (1-hour token expiry)
- Session management (view, revoke individual or all sessions)
- Sliding window session refresh
- Anonymous authentication (auto-session on first visit)
- Upgrade anonymous account to full credentials (email/password)

**API Endpoints:**
```
POST   /api/auth/register              # User registration
POST   /api/auth/login                 # User login
POST   /api/auth/logout                # Session logout
POST   /api/auth/forgot-password       # Request password reset
GET    /api/auth/validate-reset-token  # Check reset token validity
POST   /api/auth/reset-password        # Complete password reset
POST   /api/auth/resend-verification   # Resend email verification
GET    /api/auth/verify-email          # Verify email address
GET    /api/auth/session               # Get current session/user
GET    /api/auth/sessions              # List all user sessions
DELETE /api/auth/sessions/[id]         # Revoke specific session
DELETE /api/auth/sessions/others       # Revoke all other sessions
```

**Security Features:**
- Passwords hashed with bcrypt (cost 12)
- Cryptographically random session tokens (32 bytes)
- httpOnly, Secure (production), SameSite=Lax cookies
- Single-use verification tokens
- Email enumeration prevention on password reset
- Anonymous sessions with configurable duration

### Organizations & Teams

Multi-tenant organization system with team support.

**Organization Features:**
- Create organizations with unique slugs
- Add/remove members
- Assign roles to members
- Cascade delete (members, teams, invitations)

**Team Features:**
- Create teams within organizations
- Add/remove team members
- Team-level role assignments
- Organize members by project/department

**API Endpoints:**
```
POST   /api/organisations                              # Create organization
GET    /api/organisations/[orgId]/members              # List org members
POST   /api/organisations/[orgId]/members              # Add member
GET    /api/organisations/[orgId]/teams                # List org teams
POST   /api/organisations/[orgId]/teams                # Create team
GET    /api/organisations/[orgId]/teams/[teamId]       # Get team details
PUT    /api/organisations/[orgId]/teams/[teamId]       # Update team
DELETE /api/organisations/[orgId]/teams/[teamId]       # Delete team
GET    /api/organisations/[orgId]/teams/[teamId]/members    # List team members
POST   /api/organisations/[orgId]/teams/[teamId]/members    # Add team member
DELETE /api/organisations/[orgId]/teams/[teamId]/members/[userId]  # Remove member
```

### Role-Based Access Control (RBAC)

Sophisticated permission system with polymorphic roles supporting multiple scopes.

**Permission Scopes:**
- **Global** - Platform-wide permissions (Super Admin)
- **Organisation** - Organization-level permissions (Owner, Admin, Member)
- **Team** - Team-level permissions (Lead, Member)

**System Roles:**

| Role | Scope | Description | Default |
|------|-------|-------------|---------|
| Super Admin | Global | Full platform access | No |
| User | Global | Can create organizations | Yes (assigned on signup) |
| Owner | Organisation | Full organization control | No |
| Admin | Organisation | Manage members, teams, roles | No |
| Member | Organisation | Read access | Yes |
| Lead | Team | Full team control | No |
| Member | Team | View team, manage tasks | Yes |

**Permissions (27 total):**

```
# Global
platform:admin              # Full platform access
organisation:create         # Create organizations

# Organisation
organisation:read           # View organization
organisation:update         # Update organization settings
organisation:delete         # Delete organization
organisation:member:view    # View members
organisation:member:invite  # Invite members
organisation:member:remove  # Remove members
organisation:member:role:assign  # Assign roles
organisation:role:create    # Create custom roles
organisation:role:update    # Update roles
organisation:role:delete    # Delete roles
organisation:team:create    # Create teams
organisation:team:view      # View teams
organisation:team:delete    # Delete teams
organisation:billing:view   # View billing
organisation:billing:manage # Manage billing

# Team
team:read                   # View team
team:update                 # Update team
team:delete                 # Delete team
team:member:view            # View team members
team:member:add             # Add team members
team:member:remove          # Remove team members
team:member:role:assign     # Assign team roles
```

### Invitation System

Token-based invitation system for adding users to organizations.

**Flow:**
1. Admin invites user by email
2. System sends invitation email with unique token
3. User receives email and clicks acceptance link
4. User creates account (or links existing) and is added to organization
5. User automatically receives assigned role

**Features:**
- 7-day token expiry
- Unique constraint per email per organization
- Resend invitation capability
- Revoke pending invitations
- Email pre-verified on acceptance

### Admin Impersonation

Super admins can impersonate any user for debugging and support.

**Features:**
- Creates separate session with 4-hour expiry
- Original admin session preserved
- Cannot impersonate yourself
- Clear UI indication of impersonation state
- Return to original session when stopped

### User Profile Management

Complete profile management with secure email change workflow.

**Features:**
- Update profile name
- Change password (requires current password)
- Email change with verification to NEW email
- View and cancel pending email changes

### File Management & Image Processing

Pluggable file storage system with entity-based associations and automatic image variant generation.

**Storage Features:**
- Pluggable storage providers (local filesystem, S3-ready)
- Entity-based file associations (polymorphic: entity type + entity ID)
- Automatic image variant generation via Sharp
- Parent-child file relationships (original to variants)
- Configurable max file size and allowed MIME types

**Avatar System:**
- Client-side circular cropping with vue-advanced-cropper
- Multi-size variant generation: sm (64px), md (128px), lg (256px)
- WebP conversion for optimization (PNG preserved as PNG)
- Responsive variant selection on display with fallback chain
- Automatic cleanup of previous avatars on replacement

**API Endpoints:**
```
POST   /api/files                      # Upload file
GET    /api/files                      # List files by entity
DELETE /api/files/[id]                 # Delete file
GET    /api/files/[id]/serve           # Serve file content
```

### Admin Dashboard

Full administrative capabilities for platform management.

**Features:**
- View platform statistics (users, orgs, teams)
- Manage all organizations (CRUD)
- Manage all users (CRUD, avatar upload)
- Manage all teams (CRUD)
- Handle invitations
- Impersonate users
- Authentication provider settings

### Event Bus

Event-driven architecture for decoupling features.

**Event Types:**
```typescript
'auth:user-registered'    // Fired on signup (triggers role assignment)
'[tableName]:created'     // e.g., 'users:created'
'[tableName]:updated'     // e.g., 'organisations:updated'
'[tableName]:deleted'     // e.g., 'sessions:deleted'
```

### Email System

Pluggable email system with template support.

**Providers:**
- `console` - Logs to console (development)
- `smtp` - Nodemailer SMTP transport (production)

**Templates:**
- Password reset
- Email verification
- Email change confirmation
- Organization invitation

**Template Engine:** LiquidJS with variables like `{{ siteName }}`, `{{ userName }}`, `{{ resetLink }}`

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts |
| `sessions` | Active sessions (supports impersonation) |
| `organisations` | Multi-tenant organizations |
| `organisation_members` | Org membership junction |
| `organisation_invitations` | Pending invitations |
| `teams` | Teams within organizations |
| `team_members` | Team membership junction |
| `roles` | Role definitions |
| `role_permissions` | Permissions per role |
| `user_roles` | User-to-role assignments |
| `email_verification_tokens` | Email verification |
| `password_reset_tokens` | Password reset |
| `pending_email_changes` | Email change workflow |
| `files` | File metadata, variants, and entity associations |
| `auth_providers` | Authentication provider settings (e.g., anonymous, credentials) |

### ID Format

All tables use ULID (Universally Unique Lexicographically Sortable Identifier) for primary keys.

## Pages

| Path | Description |
|------|-------------|
| `/` | Home/dashboard |
| `/401` | Unauthorized page |
| `/auth/sign-in` | Login page |
| `/auth/sign-up` | Registration page |
| `/auth/forgot-password` | Password reset request |
| `/auth/reset-password` | Reset password form |
| `/auth/verify-email` | Email verification |
| `/auth/confirm-email` | Confirm email change |
| `/auth/accept-invitation` | Accept org invitation |
| `/settings` | User profile settings |
| `/settings/security` | Password & session management |
| `/admin` | Admin dashboard |
| `/admin/organisations` | Admin: Organization management |
| `/admin/organisations/create` | Admin: Create organization |
| `/admin/organisations/[id]` | Admin: Organization details |
| `/admin/teams` | Admin: Team management |
| `/admin/teams/[id]` | Admin: Team details |
| `/admin/users` | Admin: User management |
| `/admin/users/[id]` | Admin: User details |
| `/admin/settings/authentication` | Admin: Authentication provider settings |

## Key Patterns

### Dependency Injection

Factory pattern with lazy initialization in `server/utils/container.ts`:

```typescript
const getAuthService = lazy(() => createAuthService({
  usersService: container.items.users,
  sessionsService: container.items.sessions,
  emailService: container.emailService,
  eventBus: container.eventBus,
}))
```

### ItemService

Generic CRUD service with type-safe filtering:

```typescript
// Create
const user = await usersService.create({ email, passwordHash, name })

// Find with filters
const users = await usersService.findMany({
  filter: {
    organisationId: { _eq: orgId },
    createdAt: { _gte: lastMonth }
  },
  sort: ['-createdAt'],
  limit: 10
})

// Filter operators: _eq, _neq, _gt, _gte, _lt, _lte, _in, _nin, _like, _ilike, _null, _nnull
// Logical: _and, _or
```

### Permission Guards

```typescript
// Require authentication
const user = requireAuth(event)

// Require specific permission
await requirePermission(event, {
  permission: PERMISSIONS.ORGANISATION_UPDATE,
  scope: 'organisation',
  getScopeId: (event) => getRouterParam(event, 'orgId')
})

// Require super admin
await requireSuperAdmin(event)
```

### Pinia Colada Queries

```typescript
const { data, isLoading, error } = useQuery({
  key: authKeys.session(),
  query: () => useAuthApi().getSession()
})
```

## Security

### Authentication Security
- Passwords hashed with bcrypt (cost factor 12)
- Cryptographically random session tokens (32 bytes)
- httpOnly cookies prevent XSS token theft
- Secure flag in production
- SameSite=Lax prevents CSRF

### Authorization Security
- Permission checks on all protected routes
- Scope validation ensures users access only their resources
- Super admin bypass for platform operations
- Request-scoped permission caching

### Input Validation
- Zod schemas validate all API inputs
- Email normalization (lowercase, trim)
- Field constraints (min/max lengths)

## Testing

```bash
# Run tests in watch mode
pnpm test

# Run tests once
pnpm test:run
```

Test files are located in `tests/` directory with factories for creating test data.

## Extending the Project

### Adding a New Feature

1. Create feature directory in `app/features/[feature-name]/`
2. Add components, composables, types, and API wrappers
3. Create server feature in `server/features/[feature-name]/`
4. Add API routes in `server/api/`
5. Register services in `server/utils/container.ts`
6. Add database schema in `server/database/schema/`

### Adding a New Permission

1. Add permission constant in `server/features/rbac/permissions.ts`
2. Assign to appropriate roles in seed data
3. Use `requirePermission()` in API routes

### Adding a New Role

1. Add role to system roles in `server/features/rbac/service.ts`
2. Assign permissions to the role
3. Update RBAC documentation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes following the vertical slice architecture
4. Run `pnpm lint` and `pnpm typecheck`
5. Submit a pull request

## License

[MIT](LICENSE)
