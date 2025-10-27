try {
    $models = Invoke-RestMethod -Uri "http://localhost:8080/api/models" -Method GET
    Write-Host "Available models:"
    $models | ForEach-Object { Write-Host "- $($_.id): $($_.label)" }
} catch {
    Write-Host "Error getting models: $($_.Exception.Message)"
}
