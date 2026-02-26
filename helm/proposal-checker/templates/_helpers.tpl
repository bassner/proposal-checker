{{/*
Expand the name of the chart.
*/}}
{{- define "proposal-checker.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a fully qualified app name.
*/}}
{{- define "proposal-checker.fullname" -}}
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
Common labels.
*/}}
{{- define "proposal-checker.labels" -}}
helm.sh/chart: {{ include "proposal-checker.name" . }}-{{ .Chart.Version | replace "+" "_" }}
{{ include "proposal-checker.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "proposal-checker.selectorLabels" -}}
app.kubernetes.io/name: {{ include "proposal-checker.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Database URL — points to the Bitnami PostgreSQL subchart service.
*/}}
{{- define "proposal-checker.databaseUrl" -}}
{{- if .Values.postgresql.enabled -}}
postgres://{{ .Values.postgresql.auth.username }}:$(DATABASE_PASSWORD)@{{ include "proposal-checker.fullname" . }}-postgresql:5432/{{ .Values.postgresql.auth.database }}
{{- end -}}
{{- end }}
