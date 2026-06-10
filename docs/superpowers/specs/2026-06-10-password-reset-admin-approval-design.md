# Password Reset via Admin Approval — Design

**Goal:** Replace email-based forgot password with an admin-approval workflow using a 6-digit numeric reset code.

## Flow

1. User clicks "Forgot Password" → enters username + optional note → submits
2. Backend creates/replaces a `PasswordResetRequest` (status=pending)
3. Owner/Admin sees badged bell icon → "Resets" tab → approves/declines
4. On approve → popup shows 6-digit code + username (code valid 24h)
5. Admin shares code with user out-of-band (verbally, chat, etc.)
6. User → Login page → "I have a reset code" → enters code + new password → done

## Model: `PasswordResetRequest`

| Column | Type |
|---|---|
| request_id | int PK |
| user_id | FK → Users, not null |
| requester_note | text, nullable |
| reset_code | string(6), nullable |
| status | string: pending, approved, declined, used, expired |
| approved_by | FK → Users, nullable |
| approved_at | datetime, nullable |
| expires_at | datetime, nullable |
| created_at | datetime |

## Backend Routes

| Method | Route | Purpose |
|---|---|---|
| POST | /api/auth/forgot-password | Accept {username, note} → create/replace request |
| GET | /api/auth/reset-requests | List pending + return approved codes for owner/admin |
| GET | /api/auth/reset-requests/count | Count for badge |
| POST | /api/auth/reset-requests/<id>/approve | Generate 6-digit code, set expires=now+24h |
| POST | /api/auth/reset-requests/<id>/decline | Mark declined |
| POST | /api/auth/reset-with-code | Accept {reset_code, new_password} → reset |

## Frontend Changes

- ForgotPassword.jsx: username + note instead of email
- Login.jsx: "I have a reset code" button → /reset-with-code
- New: ResetWithCode.jsx: code input + new password form
- AppRouter.jsx: public /reset-with-code route
- NotificationModal.jsx: "Resets" tab with approve/decline
- Topbar.jsx: badge includes reset count

## Key Rules

- Duplicate request: cancels + replaces pending
- Code: 6 random digits
- Expiry: 24h from approval
- Visible to: all owners + all admins (all branches)
