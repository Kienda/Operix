# Credential-provider helper: stdout is private input to set-tunnel-token.py.
# Do not invoke directly in a logging terminal; the operator script captures stdout.
$ErrorActionPreference = 'Stop'
try {
    $path = Join-Path $env:LOCALAPPDATA 'Operix\credentials\cloudflare-readonly.credential.xml'
    $credential = Import-Clixml -LiteralPath $path
    $headers = @{Authorization = ('Bearer ' + $credential.GetNetworkCredential().Password.Trim())}
    $reply = Invoke-RestMethod -Method Get -Headers $headers -Uri 'https://api.cloudflare.com/client/v4/accounts/b0419cceb6d3335ba3c6dde196707b31/cfd_tunnel/9fc9647e-134d-4c9a-aaea-170a4170c896/token'
    if (-not $reply.success -or $reply.result -notmatch '^[A-Za-z0-9+/=_-]{100,4096}$') { throw 'Invalid connector response' }
    [Console]::Out.Write([string]$reply.result)
} catch {
    [Console]::Error.WriteLine('Dedicated token retrieval failed; credentials withheld.')
    exit 1
} finally { $credential=$null; $headers=$null; $reply=$null }
