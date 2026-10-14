param(
  [ValidateSet('local','staging')][string]$Mode='local',
  [ValidateSet('setup','up','down','logs','status','certificate')][string]$Action='up',
  [string]$Origin=''
)
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
function Invoke-Docker([string[]]$Arguments) {
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Docker command failed' }
}
$envFile=".env.docker.$Mode"
if ($Action -eq 'setup' -or ($Action -eq 'up' -and !(Test-Path $envFile))) {
  Invoke-Docker @('build','--quiet','-f','infra/docker/Dockerfile.setup','-t','fespay-setup:local','.')
  $setupArgs=@('run','--rm','-v',"${PWD}:/workspace",'fespay-setup:local',$Mode)
  if ($Origin) { $setupArgs+=@('--origin',$Origin) }
  Invoke-Docker $setupArgs
  if ($Action -eq 'setup') { exit }
}
$override=if ($Mode -eq 'local') {'compose.local.yaml'} else {'compose.tunnel.yaml'}
$composeArgs=@('compose','--env-file',$envFile,'-f','compose.docker.yaml','-f',$override)
switch ($Action) {
  'up' {
    Invoke-Docker ($composeArgs+@('build','api','web','migrate'))
    Invoke-Docker ($composeArgs+@('up','-d','--wait','db'))
    if ($Mode -eq 'staging') {
      New-Item -ItemType Directory -Force 'secrets/staging-backups' | Out-Null
      $backup=Join-Path $PWD ('secrets/staging-backups/'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'.sql')
      # Write native stdout as UTF-8 without PowerShell line wrapping/transcoding.
      $info=[Diagnostics.ProcessStartInfo]::new('docker')
      $info.Arguments='compose --env-file .env.docker.staging -f compose.docker.yaml -f compose.tunnel.yaml exec -T db pg_dump -U fespay_owner fespay_staging'
      $info.UseShellExecute=$false; $info.RedirectStandardOutput=$true
      $process=[Diagnostics.Process]::Start($info)
      $file=[IO.File]::Create($backup)
      try { $process.StandardOutput.BaseStream.CopyTo($file) } finally { $file.Dispose() }
      $process.WaitForExit()
      if ($process.ExitCode -ne 0) { throw 'Staging backup failed; migrations were not applied' }
    }
    Invoke-Docker ($composeArgs+@('run','--rm','migrate'))
    Invoke-Docker ($composeArgs+@('up','-d','--wait','api','web','gateway'))
  }
  'down' { Invoke-Docker ($composeArgs+@('down')) }
  'logs' { Invoke-Docker ($composeArgs+@('logs','--tail','100','api','web','gateway')) }
  'status' { Invoke-Docker ($composeArgs+@('ps')) }
  'certificate' {
    if ($Mode -ne 'local') { throw 'Local certificate only' }
    New-Item -ItemType Directory -Force '.tmp' | Out-Null
    Invoke-Docker ($composeArgs+@('cp','gateway:/data/caddy/pki/authorities/local/root.crt','.tmp/fespay-local-root.crt'))
    Write-Output 'Public CA saved: .tmp/fespay-local-root.crt. Import manually using the documented OS steps.'
  }
}
