{{/*
Expand the name of the chart.
*/}}
{{- define "slaking.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "slaking.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "slaking.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "slaking.labels" -}}
helm.sh/chart: {{ include "slaking.chart" . }}
{{ include "slaking.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "slaking.selectorLabels" -}}
app.kubernetes.io/name: {{ include "slaking.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "slaking.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "slaking.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create image name and tag used by the deployment
*/}}
{{- define "slaking.image" -}}
{{- $registryName := .Values.image.registry -}}
{{- $repositoryName := .Values.image.repository -}}
{{- $tag := .Values.image.tag | toString -}}
{{- if $registryName }}
{{- printf "%s/%s:%s" $registryName $repositoryName $tag -}}
{{- else -}}
{{- printf "%s:%s" $repositoryName $tag -}}
{{- end -}}
{{- end -}}

{{/*
Create the name of the config map
*/}}
{{- define "slaking.configMapName" -}}
{{- if .Values.configMap.create }}
{{- printf "%s-config" (include "slaking.fullname" .) }}
{{- else }}
{{- .Values.configMap.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the secret
*/}}
{{- define "slaking.secretName" -}}
{{- if .Values.secret.create }}
{{- printf "%s-secrets" (include "slaking.fullname" .) }}
{{- else }}
{{- .Values.secret.name }}
{{- end }}
{{- end }}

{{/*
Pod security standards
*/}}
{{- define "slaking.podSecurityStandards" -}}
{{- if eq .Values.podSecurityStandards.level "restricted" }}
runAsNonRoot: true
runAsUser: 1000
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop:
    - ALL
seccompProfile:
  type: RuntimeDefault
{{- else if eq .Values.podSecurityStandards.level "baseline" }}
runAsNonRoot: true
allowPrivilegeEscalation: false
{{- end }}
{{- end }}

{{/*
Create the name of the cluster role
*/}}
{{- define "slaking.clusterRoleName" -}}
{{- printf "%s-role" (include "slaking.fullname" .) }}
{{- end }}

{{/*
Create the name of the cluster role binding
*/}}
{{- define "slaking.clusterRoleBindingName" -}}
{{- printf "%s-role-binding" (include "slaking.fullname" .) }}
{{- end }}

{{/*
Create the name of the service monitor
*/}}
{{- define "slaking.serviceMonitorName" -}}
{{- printf "%s" (include "slaking.fullname" .) }}
{{- end }}

{{/*
Create the name of the horizontal pod autoscaler
*/}}
{{- define "slaking.hpaName" -}}
{{- printf "%s" (include "slaking.fullname" .) }}
{{- end }}

{{/*
Create the name of the pod disruption budget
*/}}
{{- define "slaking.pdbName" -}}
{{- printf "%s" (include "slaking.fullname" .) }}
{{- end }}

{{/*
Create the name of the network policy
*/}}
{{- define "slaking.networkPolicyName" -}}
{{- printf "%s" (include "slaking.fullname" .) }}
{{- end }}

{{/*
Create the name of the ingress
*/}}
{{- define "slaking.ingressName" -}}
{{- printf "%s" (include "slaking.fullname" .) }}
{{- end }}

{{/*
Create the name of the grafana dashboard
*/}}
{{- define "slaking.grafanaDashboardName" -}}
{{- printf "%s" (include "slaking.fullname" .) }}
{{- end }}

{{/*
Create the name of the backup cronjob
*/}}
{{- define "slaking.backupCronJobName" -}}
{{- printf "%s-backup" (include "slaking.fullname" .) }}
{{- end }} 