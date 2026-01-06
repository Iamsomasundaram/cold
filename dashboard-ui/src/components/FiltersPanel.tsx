import {
  Box,
  Button,
  ButtonGroup,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import {
  clearFilters,
  setDataProfile,
  setFrom,
  setMetric,
  setPresetWindow,
  setScenario,
  setSensorCode,
  setSeverity,
  setTenantKey,
  setTo,
  setViolationType,
} from "../features/filters/filtersSlice";
import type { Sensor, Tenant } from "../features/dashboard/types";

const scenarioOptions = ["LP1", "LP2", "LP3"];
const profileOptions = ["DP1", "DP2", "DP3"];
const severityOptions = ["critical", "warning", "info"];

type FiltersPanelProps = {
  tenants: Tenant[];
  sensors: Sensor[];
  loadingTenants?: boolean;
};

export function FiltersPanel({
  tenants,
  sensors,
  loadingTenants,
}: FiltersPanelProps) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.filters);

  return (
    <Box>
      <div className="panel-header">
        <div>
          <div className="panel-title">Filters</div>
          <div className="panel-subtitle">Single-tenant focus</div>
        </div>
        <Button size="small" onClick={() => dispatch(clearFilters())}>
          Reset
        </Button>
      </div>

      <Stack spacing={2}>
        <FormControl fullWidth size="small" disabled={loadingTenants}>
          <InputLabel>Tenant</InputLabel>
          <Select
            value={filters.tenantKey || ""}
            label="Tenant"
            onChange={(event) =>
              dispatch(setTenantKey(String(event.target.value)))
            }
          >
            {tenants.length === 0 && (
              <MenuItem value="">No tenants</MenuItem>
            )}
            {tenants.map((tenant) => (
              <MenuItem key={tenant.tenant_key} value={tenant.tenant_key}>
                {tenant.name} ({tenant.tenant_key})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <InputLabel>Scenario</InputLabel>
          <Select
            value={filters.scenario || ""}
            label="Scenario"
            onChange={(event) =>
              dispatch(setScenario(String(event.target.value)))
            }
          >
            <MenuItem value="">Any</MenuItem>
            {scenarioOptions.map((scenario) => (
              <MenuItem key={scenario} value={scenario}>
                {scenario}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <InputLabel>Data Profile</InputLabel>
          <Select
            value={filters.dataProfile || ""}
            label="Data Profile"
            onChange={(event) =>
              dispatch(setDataProfile(String(event.target.value)))
            }
          >
            <MenuItem value="">Any</MenuItem>
            {profileOptions.map((profile) => (
              <MenuItem key={profile} value={profile}>
                {profile}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <InputLabel>Sensor</InputLabel>
          <Select
            value={filters.sensorCode || ""}
            label="Sensor"
            onChange={(event) =>
              dispatch(setSensorCode(String(event.target.value)))
            }
          >
            <MenuItem value="">Any</MenuItem>
            {sensors.map((sensor) => (
              <MenuItem key={sensor.sensor_code} value={sensor.sensor_code}>
                {sensor.sensor_code}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          label="Metric"
          value={filters.metric}
          onChange={(event) => dispatch(setMetric(event.target.value))}
          placeholder="temperature"
        />

        <FormControl fullWidth size="small">
          <InputLabel>Severity</InputLabel>
          <Select
            value={filters.severity || ""}
            label="Severity"
            onChange={(event) =>
              dispatch(setSeverity(String(event.target.value)))
            }
          >
            <MenuItem value="">Any</MenuItem>
            {severityOptions.map((severity) => (
              <MenuItem key={severity} value={severity}>
                {severity}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          label="Violation Type"
          value={filters.violationType}
          onChange={(event) => dispatch(setViolationType(event.target.value))}
          placeholder="range, spike, drift"
        />

        <Box>
          <div className="panel-subtitle">Time window</div>
          <ButtonGroup size="small" sx={{ marginTop: 1 }}>
            {["1h", "2h", "24h"].map((preset) => (
              <Button
                key={preset}
                variant={filters.timeWindow === preset ? "contained" : "outlined"}
                onClick={() => dispatch(setPresetWindow(preset))}
              >
                {preset}
              </Button>
            ))}
          </ButtonGroup>
        </Box>

        <Stack spacing={1}>
          <TextField
            size="small"
            label="From"
            type="datetime-local"
            value={filters.from}
            onChange={(event) => dispatch(setFrom(event.target.value))}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            label="To"
            type="datetime-local"
            value={filters.to}
            onChange={(event) => dispatch(setTo(event.target.value))}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      </Stack>
    </Box>
  );
}
