# Try with a more common model that should be available locally
$body = @{
    prompt = "Create a simple business plan for a lemonade stand"
    speed_vs_detail = "fast_but_skip_details"
    llm_model = "gpt-4o-mini"  # Use a more commonly available model
    reasoning_effort = "low"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:8080/api/plans" -Method POST -Body $body -ContentType "application/json"
Write-Host "Plan created with gpt-4o-mini!"
Write-Host "Plan ID: $($response.plan_id)"
Write-Host "Status: $($response.status)"
$response
