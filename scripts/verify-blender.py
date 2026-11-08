"""Run with Blender --background --factory-startup --python-exit-code 1."""
import json
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree

import bmesh
import bpy

directory = Path(sys.argv[sys.argv.index("--") + 1])
fixtures = json.loads((directory / "fixtures.json").read_text())


def check_mesh(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    assert all(edge.is_manifold for edge in bm.edges), "Non-manifold imported edges"
    assert all(face.calc_area() > 1e-16 for face in bm.faces), "Degenerate imported faces"
    assert bm.calc_volume(signed=True) > 0, "Non-positive imported volume"
    bm.free()


for fixture in fixtures:
    name = fixture["name"]
    for extension, scale in [("obj", 0.001), ("stl", 1)]:
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        filepath = str(directory / (name + "." + extension))
        if extension == "obj":
            bpy.ops.wm.obj_import(filepath=filepath)
        else:
            bpy.ops.wm.stl_import(filepath=filepath)
        objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        assert len(objects) == 1, "Unexpected import object count"
        obj = objects[0]
        expected = sorted([100 * scale, 100 * scale, fixture["height"] * scale])
        actual = sorted(obj.dimensions)
        assert all(abs(a - b) < max(1e-7, b * 1e-5) for a, b in zip(actual, expected)), (name, actual, expected)
        check_mesh(obj.data)
        if extension == "obj":
            used = {polygon.material_index for polygon in obj.data.polygons}
            assert len(used) == fixture["materials"], "Lost OBJ material regions"
        print("PASS", name, extension, "closed import, dimensions and materials")

    with zipfile.ZipFile(directory / (name + ".3mf")) as archive:
        assert archive.testzip() is None, "Invalid ZIP CRC"
        root = ElementTree.fromstring(archive.read("3D/3dmodel.model"))
    ns = {"m": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"}
    objects = root.findall("m:resources/m:object", ns)
    parts = [obj for obj in objects if obj.find("m:mesh", ns) is not None]
    assert len(parts) == fixture["materials"], "Lost 3MF parts"
    assert len(root.findall("m:build/m:item", ns)) == 1, "Parts are not one assembly"
    for part in parts:
        vertices = [tuple(float(vertex.attrib[axis]) for axis in "xyz") for vertex in part.findall("m:mesh/m:vertices/m:vertex", ns)]
        faces = [tuple(int(triangle.attrib[axis]) for axis in ("v1", "v2", "v3")) for triangle in part.findall("m:mesh/m:triangles/m:triangle", ns)]
        mesh = bpy.data.meshes.new("fixture")
        mesh.from_pydata(vertices, [], faces)
        check_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    print("PASS", name, "3mf ZIP, XML, closed parts and assembly")

print("All fixture checks passed. This is not Bambu slicing or a physical print test.")
