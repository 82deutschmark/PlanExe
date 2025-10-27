$planId = "PlanExe_45c31734-5041-4715-9470-3200fe5461ef"
Invoke-RestMethod -Uri "http://localhost:8080/api/plans/$planId" -Method GET
