# Environment Setup Guide

## Quick Fix for API Test Error

The "Missing CARRIER credentials" error occurs because you need to set up environment variables for API authentication.

## Step 1: Create Environment File

Create a file named `.env` in your project root directory (same level as `package.json`):

```bash
# In your project root directory
touch .env
```

## Step 2: Add Your Credentials

Add your SureLC API credentials to the `.env` file:

```env
# Primary Equita Account (recommended)
VITE_SURELC_USER_EQUITA=your-equita-username
VITE_SURELC_PASS_EQUITA=your-equita-password

# OR Secondary Quility Account
VITE_SURELC_USER_QUILITY=your-quility-username
VITE_SURELC_PASS_QUILITY=your-quility-password

# OR General SureLC credentials (fallback)
VITE_SURELC_USER=your-username
VITE_SURELC_PASS=your-password
```

## Step 3: Restart Development Server

After adding credentials, restart your development server:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

## Step 4: Test Again

Now run the API test again:

1. **Browser Console**: `debugAdminSets.testHierarchyUploadStatus()`
2. **Debug Panel**: Click "Test Hierarchy Upload Status" button

## Optional: Smoke-test the Quility SureLC link

If you just want to confirm the Quility deep-link URL is responding and resolving (no credentials needed):

```bash
npm run test:surelc:quility-link
```

## Credential Types

### Equita Account (Recommended)
- Primary SureLC account with full permissions
- Used for all API endpoints including hierarchy upload
- Set with `VITE_SURELC_USER_EQUITA` and `VITE_SURELC_PASS_EQUITA`

### Quility Account (Alternative)
- Secondary SureLC account
- Used for all API endpoints including hierarchy upload
- Set with `VITE_SURELC_USER_QUILITY` and `VITE_SURELC_PASS_QUILITY`

### General SureLC Credentials (Fallback)
- General SureLC account
- Used for all API endpoints including hierarchy upload
- Set with `VITE_SURELC_USER` and `VITE_SURELC_PASS`

## Security Notes

- Never commit `.env` files to version control
- The `.env` file is already in `.gitignore`
- Use strong, unique passwords
- Consider using environment-specific credentials

## Troubleshooting

### Still Getting "Missing SureLC credentials" Error?

1. **Check file location**: Ensure `.env` is in the project root (same level as `package.json`)
2. **Check variable names**: Must start with `VITE_` and match exactly
3. **Restart server**: Environment variables are loaded at startup
4. **Check for typos**: Variable names are case-sensitive

### Getting 401/403 Errors?

1. **Verify credentials**: Double-check username and password
2. **Check permissions**: Ensure account has `ROLE_CARRIER` permissions
3. **Try different credentials**: Use Equita or Quility credentials instead of general ones

### Getting Network Errors?

1. **Check internet connection**
2. **Verify API server URL**
3. **Check if API server is running**

## Example .env File

```env
# Replace with your actual credentials
# Primary Equita Account (recommended)
VITE_SURELC_USER_EQUITA=equitauser
VITE_SURELC_PASS_EQUITA=equitapass

# OR Secondary Quility Account
VITE_SURELC_USER_QUILITY=quilityuser
VITE_SURELC_PASS_QUILITY=quilitypass

# OR General SureLC credentials (fallback)
VITE_SURELC_USER=myuser
VITE_SURELC_PASS=mypassword123
```

After setting up credentials, the API test should work and show you the actual API response!
