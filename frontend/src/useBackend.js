import {useEffect, useMemo, useState} from 'react';
import {getScenario, metricAt, emptyMetric, scenarioKey} from './api.js';

/** One request for the whole lunar phase cycle. Playback only reads local samples. */
export function useScenario(site, date, time, elapsed = 0) {
  const key = scenarioKey(site, date, time);
  const [state, setState] = useState({key: null, data: null, error: null});
  useEffect(() => {
    let active = true;
    setState({key, data: null, error: null});
    if (site) getScenario(site, date, time)
      .then(data => { if (active) setState({key, data, error: null}); })
      .catch(e => { if (active) setState({key, data: null, error: e.message}); });
    return () => { active = false; };
  }, [key]);
  const current = state.key === key ? state : {data: null, error: null};
  return {
    metric: useMemo(() => current.data ? metricAt(current.data, elapsed) : emptyMetric(), [current.data, elapsed]),
    loading: !!site && !current.data && !current.error,
    error: current.error,
    result: current.data,
  };
}

/** Fetch up to four site/date scenarios, without calling React hooks in a loop. */
export function useComparisons(scenarios) {
  const key = scenarios.map(({site, date, time}) => scenarioKey(site, date, time)).join('||');
  const [state, setState] = useState({key: null, data: [], errors: []});
  useEffect(() => {
    let active = true;
    setState({key, data: [], errors: []});
    Promise.all(scenarios.map(async ({site, date, time}) => {
      try { return {data: await getScenario(site, date, time), error: null}; }
      catch(e) { return {data: null, error: e.message}; }
    })).then(items => {
      if (active) setState({key, data: items.map(x => x.data), errors: items.map(x => x.error)});
    });
    return () => { active = false; };
  }, [key]);
  const current = state.key === key ? state : {data: [], errors: []};
  return {
    metrics: scenarios.map((_,i) => current.data[i] ? metricAt(current.data[i]) : emptyMetric()),
    data: current.data,
    errors: current.errors,
    loading: scenarios.length > 0 && current.data.length !== scenarios.length,
  };
}
