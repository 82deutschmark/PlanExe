# Test database connection
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8080/health" -Method GET
    Write-Host "Health check response:"
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "Health check failed: $($_.Exception.Message)"
}
