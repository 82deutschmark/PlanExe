$body = @{
    prompt = "Create a comprehensive business plan for a neighborhood lemonade stand, including location selection, pricing strategy, marketing approach, and financial projections"
    speed_vs_detail = "fast_but_skip_details"
    llm_model = "gpt-5-nano-2025-08-07"
    reasoning_effort = "low"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:8080/api/plans" -Method POST -Body $body -ContentType "application/json"
Write-Host "Plan created successfully!"
Write-Host "Plan ID: $($response.plan_id)"
Write-Host "Status: $($response.status)"
$response
