import { HistoryList } from '../components/HistoryList';
import { HistorySummary } from '../components/HistorySummary';
import { Screen } from '../components/Screen';
import { useHistory, useHistoryActions } from '../hooks/useForwarder';

export default function HistoryScreen() {
  const { history, refresh } = useHistory();
  const { retrying, retryFailed, checking, checkInbox } = useHistoryActions(refresh);

  return (
    <Screen onRefresh={refresh}>
      <HistorySummary history={history} onRetryFailed={retryFailed} retrying={retrying} />
      <HistoryList history={history} onCheckInbox={checkInbox} checking={checking} />
    </Screen>
  );
}
