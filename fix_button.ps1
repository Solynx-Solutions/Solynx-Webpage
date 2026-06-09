$src = "C:\Users\rafae\.gemini\antigravity-ide\brain\f8ccc9ef-515e-4b33-855e-881256b6fca4\.system_generated\steps\96\content.md"
$dst = "C:\Users\rafae\OneDrive\GitHub\Solynx-Webpage\live-experience\index.html"

$allLines = [System.IO.File]::ReadAllLines($src, [System.Text.Encoding]::UTF8)

# Skip the 8-line markdown header (lines 0-7), keep lines 8 to end
$htmlLines = $allLines[8..($allLines.Length - 3)]

# Fix the broken button href
$fixed = $htmlLines | ForEach-Object { $_ -replace 'href="tel:\+18554085969"', 'href="#ai-voice"' }

[System.IO.File]::WriteAllLines($dst, $fixed, [System.Text.Encoding]::UTF8)
Write-Host "Done. Lines written: $($fixed.Count)"
Write-Host "Verifying fix..."
$check = $fixed | Select-String "ai-voice-call-btn"
Write-Host $check
