-- El log de auditoría es de solo lectura (playbook 02): ni siquiera quien generó
-- el evento puede modificarlo o borrarlo. La aplicación solo inserta y consulta;
-- este disparador lo garantiza también a nivel de base de datos.

CREATE FUNCTION "audit_log_bloquear_cambios"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog es de solo lectura: no se permite % sobre esta tabla', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_solo_lectura"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_bloquear_cambios"();
