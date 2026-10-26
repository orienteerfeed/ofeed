{{- define "ofeed.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Prefer immutable digests; explicit tags remain supported for existing deployments. */}}
{{- define "ofeed.image" -}}
{{- $image := .image -}}
{{- $component := .component -}}
{{- $digest := default "" $image.digest -}}
{{- if $digest -}}
{{- if not (regexMatch "^sha256:[a-f0-9]{64}$" $digest) -}}
{{- fail (printf "%s.image.digest must be a sha256 digest" $component) -}}
{{- end -}}
{{- printf "%s@%s" $image.repository $digest -}}
{{- else -}}
{{- if .requireDigests -}}
{{- fail (printf "%s.image.digest is required when requireImageDigests=true" $component) -}}
{{- end -}}
{{- printf "%s:%s" $image.repository (required (printf "%s.image.tag is required" $component) $image.tag) -}}
{{- end -}}
{{- end -}}

{{- define "ofeed.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "ofeed.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "ofeed.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "ofeed.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ofeed.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "ofeed.apiServiceName" -}}
api
{{- end -}}

{{- define "ofeed.webServiceName" -}}
{{ include "ofeed.fullname" . }}-web
{{- end -}}

{{- define "ofeed.boardServiceName" -}}
{{ include "ofeed.fullname" . }}-board
{{- end -}}

{{- define "ofeed.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- if .Values.serviceAccount.name -}}
{{- .Values.serviceAccount.name -}}
{{- else -}}
{{- printf "%s-vault" (include "ofeed.fullname" .) -}}
{{- end -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "ofeed.vaultTemplate" -}}
{{- $path := .path -}}
{{- $keys := .secretKeys -}}
{{- if eq .kvVersion "v1" -}}
{{ printf "{{- with secret %q -}}\n" $path }}
{{- range $key := $keys }}
{{ printf "export %s=\"{{ index .Data %q }}\"\n" $key $key }}
{{- end }}
{{ printf "{{- end -}}" }}
{{- else -}}
{{ printf "{{- with secret %q -}}\n" $path }}
{{- range $key := $keys }}
{{ printf "export %s=\"{{ index .Data.data %q }}\"\n" $key $key }}
{{- end }}
{{ printf "{{- end -}}" }}
{{- end -}}
{{- end -}}
