$planId = "PlanExe_8d49490d-cfb7-4069-b04b-e0fe1da7c4e3"
$response = Invoke-RestMethod -Uri "http://localhost:8080/api/plans/$planId" -Method GET
Write-Host "Simple Plan Status:"
Write-Host "Plan ID: $($response.plan_id)"
Write-Host "Status: $($response.status)"
Write-Host "Progress: $($response.progress_percentage)%"
Write-Host "Message: $($response.progress_message)"
Write-Host "Model: $($response.llm_model)"
if ($response.error_message) {
    Write-Host "Error: $($response.error_message)"
}
$response
