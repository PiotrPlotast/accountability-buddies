import { useDashboardData } from "@/hooks/useDashboardData";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { useDashboardStatus } from "@/hooks/useDashboardStatus";

export function useDashboard() {
  const data = useDashboardData();
  const actions = useDashboardActions(data.activeGroupId);
  const status = useDashboardStatus(data.userId);

  return {
    ...data,
    ...actions,
    ...status,
  };
}
