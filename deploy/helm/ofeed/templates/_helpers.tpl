{{- define "ofeed.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
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
{{- $dbKey := .databaseUrlKey -}}
{{- $jwtKey := .jwtTokenSecretKey -}}
{{- if eq .kvVersion "v1" -}}
{{ printf "{{- with secret %q -}}\nexport DATABASE_URL=\"{{ index .Data %q }}\"\nexport JWT_TOKEN_SECRET_KEY=\"{{ index .Data %q }}\"\n{{- end -}}" $path $dbKey $jwtKey }}
{{- else -}}
{{ printf "{{- with secret %q -}}\nexport DATABASE_URL=\"{{ index .Data.data %q }}\"\nexport JWT_TOKEN_SECRET_KEY=\"{{ index .Data.data %q }}\"\n{{- end -}}" $path $dbKey $jwtKey }}
{{- end -}}
{{- end -}}
