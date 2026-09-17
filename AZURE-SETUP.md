# Getting your Azure client ID

Monkey Client cannot sign anyone in until Microsoft gives you an application ID.
This is free and takes about ten minutes, plus a wait for approval.

You need a Microsoft account. It does not have to be the one you play Minecraft on.

---

## Part 1 — register the application

1. Go to <https://portal.azure.com> and sign in.
2. Search the top bar for **Microsoft Entra ID** and open it.
   (This used to be called Azure Active Directory. Same thing.)
3. In the left pane, under *Manage*, click **App registrations**.
4. Click **New registration** and fill in:
   - **Name**: `Monkey Client`
   - **Supported account types**: *Accounts in any organizational directory and
     personal Microsoft accounts (e.g. Skype, Xbox)*
   - **Redirect URI**: leave it empty.
5. Click **Register**.

## Part 2 — turn on the desktop sign-in flow

6. In your new app, click **Authentication** in the left pane.
7. Click **Add a platform** → **Mobile and desktop applications**.
8. Tick `https://login.microsoftonline.com/common/oauth2/nativeclient`, then **Configure**.
9. Scroll to **Advanced settings** → **Allow public client flows** → set it to **Yes** → **Save**.
   Device-code sign-in will not work without this.

## Part 3 — add a client secret you will never use

10. Go to **Certificates & secrets** → **Client secrets** → **New client secret**.
11. Give it any description, click **Add**.

Do not copy the value. You genuinely do not need it — a launcher is a public
client and must not ship secrets. Microsoft's review process just expects one
to exist.

## Part 4 — put the ID in the launcher

12. Go to **Overview** and copy **Application (client) ID**.
13. Open `electron/config.js` and paste it in:

    ```js
    clientId: 'paste-the-id-here'
    ```

The client ID is not a secret and is safe to commit to git.

## Part 5 — fail on purpose, then ask for approval

14. Run the launcher and try to sign in. You will get:

    > Mojang has not approved this Azure application yet.

    **This is supposed to happen.** Microsoft will not whitelist an app that has
    never been used, so this failed attempt is a required step.

15. Fill in the approval form at <https://aka.ms/mce-reviewappid>.
    You need your **Application (client) ID** and **Directory (tenant) ID**, both
    on the Overview page. Describe it honestly: a personal, non-commercial
    Minecraft launcher.

16. Wait. Approval takes days to weeks, and up to 24 hours more to take effect
    after you get the email.

Until approval lands, everything else in Monkey Client works — profiles, mods,
skin previews, settings. Only the sign-in step is blocked, and the launcher
tells you so instead of failing silently.

---

## When sign-in fails

| What you see | What it means |
| --- | --- |
| No Azure client ID configured | `config.js` is still empty |
| Microsoft rejected the device-code request | Wrong ID, or *Allow public client flows* is off |
| Mojang has not approved this Azure application | Expected before whitelisting (Part 5) |
| This Microsoft account has no Xbox profile | Sign in once at minecraft.net first |
| This account is registered as a child | Needs adding to a Microsoft Family group |
| Does not own Java Edition, or never set a username | Game Pass accounts must open the official launcher once |

Every one of these is mapped to a plain-English message in `electron/auth.js`,
so the launcher never shows a bare error code.
